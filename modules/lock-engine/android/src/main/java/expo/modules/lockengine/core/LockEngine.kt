package expo.modules.lockengine.core

import android.content.Context
import android.content.Intent
import android.util.Log
import expo.modules.lockengine.core.logic.LockPlanner
import expo.modules.lockengine.core.logic.LockRecord
import expo.modules.lockengine.core.logic.LockRegistry
import expo.modules.lockengine.core.logic.LockType
import expo.modules.lockengine.core.logic.ReleasedBy
import expo.modules.lockengine.core.logic.Schedule
import expo.modules.lockengine.core.logic.ScheduleCalculator
import expo.modules.lockengine.core.logic.ScheduleParser
import org.json.JSONObject

/**
 * 잠금 엔진 본체. RN/Expo 에 의존하지 않는다(브리지는 [listener] 로만 연결).
 * 모든 판단(스케줄 계산, 잠금 시작/해제, 만료)은 기기 안에서 하며 네트워크를 쓰지 않는다.
 * 같은 프로세스의 서비스·리시버·브리지가 이 싱글턴을 공유한다.
 */
object LockEngine {
  private const val TAG = "LockEngine"

  /** 브리지가 붙어 있으면 이벤트를 바로 전달한다. 없으면 로그에 쌓아 두었다가 drainEvents 로 넘긴다. */
  fun interface Listener { fun onEvent(name: String, payload: Map<String, Any?>) }

  @Volatile var listener: Listener? = null

  private val calc = ScheduleCalculator()
  private val mutex = Any()
  private var loaded = false
  private var registry = LockRegistry()
  private var schedule: Schedule = Schedule.EMPTY
  private var done: Set<String> = emptySet()

  private fun load(ctx: Context) {
    if (loaded) return
    val store = LockStore(ctx)
    registry = LockRegistry(store.loadLocks())
    done = store.loadDone()
    schedule = store.scheduleJson?.let { runCatching { ScheduleParser.parse(it) }.getOrNull() } ?: Schedule.EMPTY
    loaded = true
  }

  private fun persist(ctx: Context) {
    val store = LockStore(ctx)
    store.saveLocks(registry.all())
    store.saveDone(done)
  }

  private fun emit(ctx: Context, name: String, r: LockRecord, releasedBy: ReleasedBy?, now: Long) {
    val p = HashMap<String, Any?>()
    p["type"] = r.type.id
    p["startedAt"] = r.startedAt
    p["until"] = r.until
    if (releasedBy != null) {
      p["releasedBy"] = releasedBy.id
      p["endedAt"] = now
    }
    val l = listener
    if (l != null) {
      try { l.onEvent(name, p) } catch (e: Exception) { Log.w(TAG, "listener failed", e) }
    } else {
      LockStore(ctx).appendEvent(JSONObject(p).put("event", name))
    }
  }

  // --- 외부 API -------------------------------------------------------------------------

  fun startLock(ctx: Context, type: LockType, untilMs: Long, allowed: Set<String>, now: Long = System.currentTimeMillis()): Boolean {
    synchronized(mutex) {
      load(ctx)
      val res = registry.start(type, untilMs, allowed, now) ?: return false
      if (res.isNew) emit(ctx, "onLockStarted", res.record, null, now)
      persist(ctx)
    }
    afterChange(ctx, now)
    return true
  }

  /**
   * 잠금을 푼다. 지금 걸려 있는 같은 종류의 스케줄 구간은 "해결됨"으로 표시해서, 다음 평가 때 다시 잠기지 않게 한다.
   * 해제 트리거(끼니 사진 저장, 지오펜스 도착, 비상, 쿠폰)는 모두 JS 가 이 함수를 부른다.
   */
  fun releaseLock(ctx: Context, type: LockType, by: ReleasedBy, now: Long = System.currentTimeMillis()): Boolean {
    var released = false
    synchronized(mutex) {
      load(ctx)
      val rec = registry.release(type)
      calc.windows(schedule, now).filter { it.type == type && it.startMs <= now && now < it.untilMs }
        .forEach { done = done + it.key }
      rec?.key?.let { done = done + it }
      if (rec != null) {
        released = true
        emit(ctx, "onLockReleased", rec, by, now)
      }
      persist(ctx)
    }
    afterChange(ctx, now)
    return released
  }

  fun releaseAll(ctx: Context, by: ReleasedBy, now: Long = System.currentTimeMillis()): Int {
    var n = 0
    for (t in LockType.entries) if (releaseLock(ctx, t, by, now)) n++
    return n
  }

  /** 마감 전에 이미 기록했거나(끼니), 도착·휴식권으로 해결한(헬스) 구간을 미리 "해결됨"으로 표시한다. */
  fun markDone(ctx: Context, type: LockType, dayKey: String, index: Int?, now: Long = System.currentTimeMillis()) {
    synchronized(mutex) {
      load(ctx)
      val key = if (type == LockType.MEAL) "meal:$dayKey:${index ?: 0}" else "${type.id}:$dayKey"
      done = done + key
      persist(ctx)
    }
    sync(ctx, now)
  }

  /**
   * 스케줄(앱 Settings JSON)을 저장한다. [ignoreStarted] 가 true 면 이미 시작된 구간은 해결된 것으로 본다
   * (온보딩 직후 과거 마감 때문에 갑자기 잠기지 않게).
   */
  fun setSchedule(ctx: Context, json: String, ignoreStarted: Boolean, now: Long = System.currentTimeMillis()) {
    val parsed = ScheduleParser.parse(json) // 형식이 틀리면 예외 -> 브리지가 JS 로 던진다
    synchronized(mutex) {
      load(ctx)
      schedule = parsed
      LockStore(ctx).scheduleJson = json
      if (ignoreStarted) {
        done = done + calc.windows(schedule, now).filter { it.startMs <= now }.map { it.key }
      }
      persist(ctx)
    }
    sync(ctx, now)
  }

  fun activeLocks(ctx: Context, now: Long = System.currentTimeMillis()): List<LockRecord> {
    var expiredAny = false
    val list: List<LockRecord>
    synchronized(mutex) {
      load(ctx)
      val gone = registry.expire(now)
      gone.forEach { emit(ctx, "onLockReleased", it, ReleasedBy.TIME, now) }
      expiredAny = gone.isNotEmpty()
      if (expiredAny) persist(ctx)
      list = registry.active(now)
    }
    if (expiredAny) afterChange(ctx, now)
    return list
  }

  fun allowedApps(ctx: Context): Set<String> = synchronized(mutex) { load(ctx); schedule.allowedApps }

  fun drainEvents(ctx: Context) = LockStore(ctx).drainEvents()

  /**
   * 알람·부팅·시각 변경·스케줄 변경 때 부르는 단일 진입점.
   * 만료 처리 -> 스케줄상 지금 걸려야 할 잠금 시작 -> 다음 알람 예약 -> 걸린 게 있으면 감시 서비스 기동.
   */
  fun sync(ctx: Context, now: Long = System.currentTimeMillis()) {
    synchronized(mutex) {
      load(ctx)
      registry.expire(now).forEach { emit(ctx, "onLockReleased", it, ReleasedBy.TIME, now) }
      val plan = LockPlanner.plan(schedule, done, registry.all(), now, calc)
      for (w in plan.active) {
        val res = registry.start(w.type, w.untilMs, schedule.allowedApps, now, w.key)
        if (res != null && res.isNew) emit(ctx, "onLockStarted", res.record, null, now)
      }
      done = LockPlanner.pruneDone(done, calc.dateKey(now - 3 * 86_400_000L))
      persist(ctx)
    }
    afterChange(ctx, now)
  }

  private fun afterChange(ctx: Context, now: Long) {
    val (edge, locked) = synchronized(mutex) {
      load(ctx)
      LockPlanner.plan(schedule, done, registry.all(), now, calc).nextEdgeMs to registry.isLocked(now)
    }
    AlarmScheduler.set(ctx, edge)
    if (locked) ensureService(ctx)
  }

  private fun ensureService(ctx: Context) {
    // Do not monitor apps until the user has granted both required permissions.
    val permissions = Permissions.status(ctx)
    if (permissions["usageAccess"] != true || permissions["overlay"] != true) return
    try {
      ctx.startForegroundService(Intent(ctx, LockService::class.java))
    } catch (e: Exception) {
      // 백그라운드에서 FGS 시작이 막힌 경우(예: 정확한 알람 권한 없이 근사 알람으로 깨어남). 다음 알람/앱 실행 때 다시 시도한다.
      Log.w(TAG, "cannot start LockService", e)
    }
  }

  /** getLockState 용 스냅샷 */
  fun snapshot(ctx: Context, now: Long = System.currentTimeMillis()): Map<String, Any?> {
    val locks = activeLocks(ctx, now)
    return mapOf(
      "locked" to locks.isNotEmpty(),
      "locks" to locks.map {
        mapOf("type" to it.type.id, "startedAt" to it.startedAt, "until" to it.until, "allowedPackages" to it.allowedPackages.toList())
      },
      "hasSchedule" to synchronized(mutex) { load(ctx); LockStore(ctx).scheduleJson != null },
    )
  }
}
