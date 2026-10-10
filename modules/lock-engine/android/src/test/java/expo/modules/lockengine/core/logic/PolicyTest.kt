package expo.modules.lockengine.core.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BlockPolicyTest {
  private val own = "com.fitdoing.app"
  private val lock = LockRecord(LockType.MEAL, 0, 10_000, setOf("com.spotify.music"))
  private val base = setOf("com.sec.android.app.launcher")

  private fun block(pkg: String?, locks: List<LockRecord> = listOf(lock), user: Set<String> = emptySet()) =
    BlockPolicy.shouldBlock(pkg, locks, own, base, user)

  @Test fun blocksSocialApp() = assertTrue(block("com.instagram.android"))
  @Test fun noLockNoBlock() = assertFalse(block("com.instagram.android", emptyList()))
  @Test fun unknownForegroundNotBlocked() = assertFalse(block(null))
  @Test fun ownAppAllowed() = assertFalse(block(own))
  @Test fun launcherAllowed() = assertFalse(block("com.sec.android.app.launcher"))
  @Test fun systemSettingsAlwaysRemainAvailable() = assertFalse(block("com.android.settings"))
  @Test fun phoneSmsMapsAlarmAllowedByFallback() {
    listOf("com.samsung.android.dialer", "com.google.android.apps.messaging", "com.nhn.android.nmap", "com.google.android.deskclock")
      .forEach { assertFalse(it, block(it)) }
  }
  @Test fun perLockAllowedAppPasses() = assertFalse(block("com.spotify.music"))
  @Test fun userAllowedAppPasses() = assertFalse(block("com.spotify.music", user = setOf("com.spotify.music")))
  @Test fun allActiveLocksMustAllow() {
    val sleep = LockRecord(LockType.SLEEP, 0, 10_000, emptySet())
    assertTrue(block("com.spotify.music", listOf(lock, sleep)))
  }
}

class ForegroundTrackerTest {
  @Test fun followsLastResumed() {
    val t = ForegroundTracker()
    t.onResumed("a", 1); t.onPaused("a", 2); t.onResumed("b", 3)
    assertEquals("b", t.current)
  }
  @Test fun pauseOfOtherAppKeepsCurrent() {
    val t = ForegroundTracker()
    t.onResumed("a", 1); t.onResumed("b", 2); t.onPaused("a", 3)
    assertEquals("b", t.current)
  }
  @Test fun overlappingReplayIsIdempotent() {
    val t = ForegroundTracker()
    t.onResumed("a", 1); t.onResumed("b", 5)
    t.onResumed("a", 1) // 겹쳐 읽은 오래된 이벤트
    assertEquals("b", t.current)
  }
  @Test fun pauseClears() {
    val t = ForegroundTracker()
    t.onResumed("a", 1); t.onPaused("a", 2)
    assertNull(t.current)
  }
}

class VendorIntentsTest {
  @Test fun samsungAndXiaomiHaveCandidates() {
    assertTrue(VendorIntents.batteryCandidates("samsung").any { it.pkg.startsWith("com.samsung") })
    assertTrue(VendorIntents.batteryCandidates("Xiaomi").any { it.pkg.startsWith("com.miui") })
    assertTrue(VendorIntents.batteryCandidates("google").isEmpty())
  }
}

class ScheduleParserTest {
  @Test fun parsesAppSettingsJson() {
    val s = ScheduleParser.parse(
      """{"mode":"spicy","goal":"keep","meals":[{"index":1,"deadline":"08:00"},{"index":2,"deadline":"14:00"}],
      "gym":{"enabled":true,"days":[0,1,2],"arriveBy":"19:00","lat":null},
      "sleep":{"enabled":true,"bedTime":"23:30","wakeTime":"07:00"},
      "targets":{"kcal":1800},"allowedApps":["com.kakao.talk"],"lockMinutes":90}""",
    )
    assertEquals("spicy", s.mode)
    assertEquals(2, s.meals.size)
    assertEquals(setOf(0, 1, 2), s.gym.days)
    assertEquals("19:00", s.gym.arriveBy)
    assertEquals(setOf("com.kakao.talk"), s.allowedApps)
    assertEquals(90, s.lockMinutes)
  }

  @Test fun missingFieldsFallBackToDefaults() {
    val s = ScheduleParser.parse("{}")
    assertEquals(120, s.lockMinutes)
    assertFalse(s.gym.enabled)
    assertTrue(s.meals.isEmpty())
  }

  @Test(expected = org.json.JSONException::class) fun invalidJsonThrows() {
    ScheduleParser.parse("not json")
  }
}

class LockCodecTest {
  @Test fun roundTrip() {
    val r = listOf(LockRecord(LockType.GYM, 1, 2, setOf("a", "b"), "gym:2026-10-05"), LockRecord(LockType.MEAL, 3, 4, emptySet(), null))
    assertEquals(r, LockCodec.recordsFromString(LockCodec.recordsToString(r)))
    assertEquals(setOf("x:1"), LockCodec.setFromString(LockCodec.setToString(setOf("x:1"))))
    assertTrue(LockCodec.recordsFromString("garbage").isEmpty())
  }
}
