package expo.modules.lockengine.core.logic

// 이 패키지(core.logic)는 Android 프레임워크를 import 하지 않는다. JVM 단위 테스트로 검증한다.

enum class LockType(val id: String) {
  MEAL("meal"),
  GYM("gym"),
  SLEEP("sleep");

  companion object {
    fun parse(id: String?): LockType? = entries.firstOrNull { it.id == id }
  }
}

enum class ReleasedBy(val id: String) {
  ACTION("action"), // 끼니 사진 저장, 지오펜스 도착 등 행동으로 풀림
  TIME("time"), // until 도달, 기상 시각
  EMERGENCY("emergency"),
  COUPON("coupon");

  companion object {
    fun parse(id: String?): ReleasedBy = entries.firstOrNull { it.id == id } ?: ACTION
  }
}

data class MealSlot(val index: Int, val deadline: String) // deadline 'HH:mm'

data class GymSchedule(
  val enabled: Boolean,
  val days: Set<Int>, // 0=월 ... 6=일 (앱 설정과 같은 규칙)
  val arriveBy: String, // 'HH:mm'
)

data class SleepSchedule(val enabled: Boolean, val bedTime: String, val wakeTime: String)

/** 앱 설정 중 잠금 엔진이 쓰는 부분. 칼로리·영양 목표는 일부러 받지 않는다(칼로리로는 절대 잠그지 않는다). */
data class Schedule(
  val mode: String, // mild | normal | spicy
  val meals: List<MealSlot>,
  val gym: GymSchedule,
  val sleep: SleepSchedule,
  val allowedApps: Set<String>,
  val lockMinutes: Int,
) {
  /** 순한맛은 알림만 보내고 잠그지 않는다. */
  val locksEnabled: Boolean get() = mode != "mild"

  companion object {
    val EMPTY = Schedule(
      mode = "mild",
      meals = emptyList(),
      gym = GymSchedule(false, emptySet(), "19:00"),
      sleep = SleepSchedule(false, "23:30", "07:00"),
      allowedApps = emptySet(),
      lockMinutes = 120,
    )
  }
}

/** 스케줄이 만들어낸 잠금 구간 [startMs, untilMs). key 는 "행동으로 해결됨"을 기억하는 데 쓴다. */
data class LockWindow(val type: LockType, val key: String, val startMs: Long, val untilMs: Long)

data class LockRecord(
  val type: LockType,
  val startedAt: Long,
  val until: Long,
  val allowedPackages: Set<String>,
  val key: String? = null,
)
