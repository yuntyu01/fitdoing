package expo.modules.lockengine.core.logic

import java.util.Calendar
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private val SEOUL = TimeZone.getTimeZone("Asia/Seoul")
private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int): Long =
  Calendar.getInstance(SEOUL).apply { clear(); set(y, mo - 1, d, h, mi, 0) }.timeInMillis

private fun schedule(
  mode: String = "normal",
  meals: List<MealSlot> = listOf(MealSlot(1, "09:00"), MealSlot(2, "14:00")),
  gym: GymSchedule = GymSchedule(false, emptySet(), "19:00"),
  sleep: SleepSchedule = SleepSchedule(false, "23:30", "07:00"),
  allowed: Set<String> = emptySet(),
  lockMinutes: Int = 120,
) = Schedule(mode, meals, gym, sleep, allowed, lockMinutes)

class ScheduleCalculatorTest {
  private val calc = ScheduleCalculator(SEOUL)
  // 2026-10-05 은 월요일
  private val now = at(2026, 10, 5, 8, 0)

  @Test fun mealWindowIsDeadlinePlusLockMinutes() {
    val w = calc.windows(schedule(), now).first { it.key == "meal:2026-10-05:1" }
    assertEquals(at(2026, 10, 5, 9, 0), w.startMs)
    assertEquals(at(2026, 10, 5, 11, 0), w.untilMs)
  }

  @Test fun mealsPastMidnightRollToNextDay() {
    val s = schedule(meals = listOf(MealSlot(1, "20:00"), MealSlot(2, "00:30")))
    val w = calc.windows(s, now).first { it.key == "meal:2026-10-05:2" }
    assertEquals(at(2026, 10, 6, 0, 30), w.startMs)
  }

  @Test fun sleepSpansMidnightToWakeTime() {
    val s = schedule(meals = emptyList(), sleep = SleepSchedule(true, "23:30", "07:00"))
    val w = calc.windows(s, now).first { it.key == "sleep:2026-10-05" }
    assertEquals(at(2026, 10, 5, 23, 30), w.startMs)
    assertEquals(at(2026, 10, 6, 7, 0), w.untilMs)
  }

  @Test fun sleepAfterMidnightBedtimeEndsSameDay() {
    val s = schedule(meals = emptyList(), sleep = SleepSchedule(true, "01:00", "07:00"))
    val w = calc.windows(s, now).first { it.key == "sleep:2026-10-05" }
    assertEquals(at(2026, 10, 5, 1, 0), w.startMs)
    assertEquals(at(2026, 10, 5, 7, 0), w.untilMs)
  }

  @Test fun gymOnlyOnSelectedWeekdays() {
    val s = schedule(meals = emptyList(), gym = GymSchedule(true, setOf(0, 2), "19:00")) // 월, 수
    val keys = calc.windows(s, now).filter { it.type == LockType.GYM }.map { it.key }
    assertTrue("gym:2026-10-05" in keys)
    assertTrue("gym:2026-10-07" in keys)
    assertFalse("gym:2026-10-06" in keys)
  }

  @Test fun mildModeNeverLocks() {
    assertTrue(calc.windows(schedule(mode = "mild"), now).isEmpty())
  }

  @Test fun disabledGymAndSleepProduceNothing() {
    val s = schedule(meals = emptyList())
    assertTrue(calc.windows(s, now).isEmpty())
  }

  @Test fun invalidTimesAreSkipped() {
    val s = schedule(meals = listOf(MealSlot(1, "garbage"), MealSlot(2, "10:00")))
    val keys = calc.windows(s, now).map { it.key }
    assertFalse(keys.any { it.endsWith(":1") })
    assertTrue("meal:2026-10-05:2" in keys)
  }
}

class LockPlannerTest {
  private val calc = ScheduleCalculator(SEOUL)

  @Test fun activeAfterDeadlineAndNextEdgeIsUntil() {
    val now = at(2026, 10, 5, 9, 30)
    val p = LockPlanner.plan(schedule(), emptySet(), emptyList(), now, calc)
    assertEquals(listOf("meal:2026-10-05:1"), p.active.map { it.key })
    // 다음 경계: 09:00 구간의 until 11:00 (14:00 시작보다 이르다)
    assertEquals(at(2026, 10, 5, 11, 0), p.nextEdgeMs)
  }

  @Test fun beforeDeadlineNothingActiveAndNextEdgeIsStart() {
    val now = at(2026, 10, 5, 8, 0)
    val p = LockPlanner.plan(schedule(), emptySet(), emptyList(), now, calc)
    assertTrue(p.active.isEmpty())
    assertEquals(at(2026, 10, 5, 9, 0), p.nextEdgeMs)
  }

  @Test fun doneWindowIsNotActiveAndNotAnEdge() {
    val now = at(2026, 10, 5, 9, 30)
    val p = LockPlanner.plan(schedule(), setOf("meal:2026-10-05:1"), emptyList(), now, calc)
    assertTrue(p.active.isEmpty())
    assertEquals(at(2026, 10, 5, 14, 0), p.nextEdgeMs)
  }

  @Test fun rebootInsideWindowStillLocks() {
    // 부팅 직후(레지스트리 비어 있음)라도 스케줄상 지금이 구간 안이면 다시 잠긴다.
    val now = at(2026, 10, 5, 10, 59)
    assertEquals(1, LockPlanner.plan(schedule(), emptySet(), emptyList(), now, calc).active.size)
  }

  @Test fun noCalorieInputExistsInSchedule() {
    // 설계 보증: Schedule 은 영양 수치 필드를 갖지 않는다 -> 칼로리 초과로 잠길 수 없다.
    val names = Schedule::class.java.declaredFields.map { it.name.lowercase() }
    assertTrue(names.none { "kcal" in it || "calor" in it || "protein" in it })
  }

  @Test fun pruneDropsOldKeys() {
    val kept = LockPlanner.pruneDone(setOf("meal:2026-10-01:1", "meal:2026-10-05:1", "gym:2026-10-04"), "2026-10-03")
    assertEquals(setOf("meal:2026-10-05:1", "gym:2026-10-04"), kept)
  }
}

class LockRegistryTest {
  @Test fun startMergesSameTypeKeepingLaterUntil() {
    val r = LockRegistry()
    assertTrue(r.start(LockType.MEAL, 2000, emptySet(), 1000)!!.isNew)
    val second = r.start(LockType.MEAL, 3000, emptySet(), 1500)!!
    assertFalse(second.isNew)
    assertEquals(3000, second.record.until)
    assertEquals(1000, second.record.startedAt)
  }

  @Test fun pastUntilIsRejected() {
    assertNull(LockRegistry().start(LockType.GYM, 1000, emptySet(), 1000))
  }

  @Test fun expireAndRelease() {
    val r = LockRegistry()
    r.start(LockType.MEAL, 2000, emptySet(), 1000)
    r.start(LockType.SLEEP, 9000, emptySet(), 1000)
    assertEquals(listOf(LockType.MEAL), r.expire(2000).map { it.type })
    assertEquals(9000L, r.nearestUntil(2500))
    assertNotNull(r.release(LockType.SLEEP))
    assertFalse(r.isLocked(2500))
  }
}
