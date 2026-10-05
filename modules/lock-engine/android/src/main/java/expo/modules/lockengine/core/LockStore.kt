package expo.modules.lockengine.core

import android.content.Context
import android.content.SharedPreferences
import expo.modules.lockengine.core.logic.LockCodec
import expo.modules.lockengine.core.logic.LockRecord
import org.json.JSONArray
import org.json.JSONObject

/** 스케줄·잠금 상태·해결 키·이벤트 로그를 SharedPreferences 에 둔다. 재부팅 뒤에도 남는다. 전부 기기 안에만 저장. */
class LockStore(ctx: Context) {
  private val sp: SharedPreferences = ctx.applicationContext.getSharedPreferences("lock_engine", Context.MODE_PRIVATE)

  var scheduleJson: String?
    get() = sp.getString(K_SCHEDULE, null)
    set(v) = sp.edit().putString(K_SCHEDULE, v).apply()

  fun loadLocks(): List<LockRecord> = LockCodec.recordsFromString(sp.getString(K_LOCKS, null))
  fun saveLocks(list: Collection<LockRecord>) = sp.edit().putString(K_LOCKS, LockCodec.recordsToString(list)).apply()

  fun loadDone(): Set<String> = LockCodec.setFromString(sp.getString(K_DONE, null))
  fun saveDone(s: Set<String>) = sp.edit().putString(K_DONE, LockCodec.setToString(s)).apply()

  /** JS 가 아직 못 읽은 이벤트(앱이 죽어 있는 동안 생긴 것 포함). drain 하면 비운다. */
  fun appendEvent(e: JSONObject) {
    val a = try { JSONArray(sp.getString(K_EVENTS, "[]")) } catch (_: Exception) { JSONArray() }
    a.put(e)
    // 무한히 쌓이지 않게 최근 200개만.
    val trimmed = JSONArray()
    for (i in maxOf(0, a.length() - 200) until a.length()) trimmed.put(a.get(i))
    sp.edit().putString(K_EVENTS, trimmed.toString()).apply()
  }

  fun drainEvents(): JSONArray {
    val a = try { JSONArray(sp.getString(K_EVENTS, "[]")) } catch (_: Exception) { JSONArray() }
    sp.edit().remove(K_EVENTS).apply()
    return a
  }

  private companion object {
    const val K_SCHEDULE = "schedule"
    const val K_LOCKS = "locks"
    const val K_DONE = "done"
    const val K_EVENTS = "events"
  }
}
