package expo.modules.lockengine.core.logic

import java.util.Calendar
import java.util.TimeZone

/** 스케줄 -> 실제 잠금 구간 계산. 시각은 기기 로컬 시간대 기준(tz 주입 가능). */
class ScheduleCalculator(private val tz: TimeZone = TimeZone.getDefault()) {

  fun dateKey(ms: Long): String {
    val c = cal(ms)
    return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
  }

  /** 'HH:mm' -> 분. 형식이 틀리면 null. */
  fun toMinutes(hhmm: String): Int? {
    val p = hhmm.split(":")
    if (p.size != 2) return null
    val h = p[0].trim().toIntOrNull() ?: return null
    val m = p[1].trim().toIntOrNull() ?: return null
    if (h !in 0..47 || m !in 0..59) return null
    return h * 60 + m
  }

  private fun cal(ms: Long): Calendar = Calendar.getInstance(tz).apply { timeInMillis = ms }

  /** nowMs 가 속한 날 + offset 일의 00:00. */
  private fun dayStart(nowMs: Long, offsetDays: Int): Long {
    val c = cal(nowMs)
    c.set(Calendar.HOUR_OF_DAY, 0); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
    c.add(Calendar.DAY_OF_MONTH, offsetDays)
    return c.timeInMillis
  }

  /** 그날 00:00 + 분. 1440 이상이면 다음 날로 넘어간다(lenient). */
  private fun atMinutes(dayStartMs: Long, min: Int): Long {
    val c = cal(dayStartMs)
    c.set(Calendar.HOUR_OF_DAY, 0)
    c.set(Calendar.MINUTE, min)
    return c.timeInMillis
  }

  /** 0=월 ... 6=일 */
  private fun weekdayMon0(ms: Long): Int = (cal(ms).get(Calendar.DAY_OF_WEEK) + 5) % 7

  /**
   * now 기준 어제부터 [aheadDays]일 뒤까지의 모든 잠금 구간.
   * 끼니: 마감이 앞 끼니보다 이르거나 같으면 자정을 넘긴 것으로 본다(앱 domain/meals.ts 와 같은 규칙).
   * 헬스: 도착 시간부터 lockMinutes 동안. 취침: 취침 시각부터 다음 기상 시각까지.
   */
  fun windows(schedule: Schedule, nowMs: Long, aheadDays: Int = 7): List<LockWindow> {
    if (!schedule.locksEnabled) return emptyList()
    val lockMs = schedule.lockMinutes.coerceAtLeast(0) * 60_000L
    val out = ArrayList<LockWindow>()
    for (off in -1..aheadDays) {
      val day = dayStart(nowMs, off)
      val key = dateKey(day)

      if (lockMs > 0) {
        var offset = 0
        var prev = -1
        for (m in schedule.meals.sortedBy { it.index }) {
          var min = (toMinutes(m.deadline) ?: continue) + offset
          if (min <= prev) { offset += 1440; min += 1440 }
          prev = min
          val start = atMinutes(day, min)
          out += LockWindow(LockType.MEAL, "meal:$key:${m.index}", start, start + lockMs)
        }
      }

      val g = schedule.gym
      if (g.enabled && lockMs > 0 && weekdayMon0(day) in g.days) {
        toMinutes(g.arriveBy)?.let {
          val start = atMinutes(day, it)
          out += LockWindow(LockType.GYM, "gym:$key", start, start + lockMs)
        }
      }

      val s = schedule.sleep
      if (s.enabled) {
        val bed = toMinutes(s.bedTime)
        val wake = toMinutes(s.wakeTime)
        if (bed != null && wake != null) {
          val start = atMinutes(day, bed)
          var end = atMinutes(day, wake)
          if (end <= start) end = atMinutes(day, wake + 1440)
          out += LockWindow(LockType.SLEEP, "sleep:$key", start, end)
        }
      }
    }
    return out.sortedBy { it.startMs }
  }
}
