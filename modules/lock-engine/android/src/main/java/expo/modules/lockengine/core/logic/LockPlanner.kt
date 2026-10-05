package expo.modules.lockengine.core.logic

data class Plan(
  /** 지금 걸려 있어야 하는 구간(이미 행동으로 해결된 것 제외) */
  val active: List<LockWindow>,
  /** 다음에 깨어나야 하는 시각: 다음 구간 시작 또는 걸린 잠금의 until 중 가장 이른 것 */
  val nextEdgeMs: Long?,
)

object LockPlanner {
  /**
   * 스케줄 + 해결된 키(done) + 현재 걸린 잠금 -> 지금 걸어야 할 구간과 다음 알람 시각.
   * 네트워크·서버 판단 없음. 칼로리 같은 영양 수치는 입력에 아예 없다.
   */
  fun plan(
    schedule: Schedule,
    done: Set<String>,
    current: Collection<LockRecord>,
    nowMs: Long,
    calc: ScheduleCalculator = ScheduleCalculator(),
  ): Plan {
    val windows = calc.windows(schedule, nowMs).filter { it.key !in done }
    val active = windows.filter { it.startMs <= nowMs && nowMs < it.untilMs }
    val edges = ArrayList<Long>()
    windows.filter { it.startMs > nowMs }.forEach { edges += it.startMs }
    active.forEach { edges += it.untilMs }
    current.filter { it.until > nowMs }.forEach { edges += it.until }
    return Plan(active, edges.minOrNull())
  }

  /** 'type:YYYY-MM-DD[:n]' 키의 날짜가 cutoffKey('YYYY-MM-DD') 보다 이전이면 버린다. */
  fun pruneDone(done: Set<String>, cutoffDateKey: String): Set<String> =
    done.filter { k -> k.split(":").getOrNull(1)?.let { it >= cutoffDateKey } ?: false }.toSet()
}
