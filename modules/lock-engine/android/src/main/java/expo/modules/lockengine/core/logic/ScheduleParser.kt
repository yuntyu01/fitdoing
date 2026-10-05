package expo.modules.lockengine.core.logic

import org.json.JSONArray
import org.json.JSONObject

/** 앱 Settings JSON(app/src/db/schema.ts) -> Schedule. 모르는 필드는 무시, 없는 필드는 기본값. */
object ScheduleParser {
  fun parse(json: String): Schedule {
    val o = JSONObject(json)
    val gym = o.optJSONObject("gym")
    val sleep = o.optJSONObject("sleep")
    return Schedule(
      mode = o.optString("mode", "normal"),
      meals = o.optJSONArray("meals").toList { m ->
        MealSlot(m.optInt("index"), m.optString("deadline"))
      },
      gym = GymSchedule(
        enabled = gym?.optBoolean("enabled", false) ?: false,
        days = gym?.optJSONArray("days").toInts().toSet(),
        // 앱 설정은 arriveBy, 시안 이전 이름 startTime 도 받아 준다.
        arriveBy = gym?.optString("arriveBy").orEmpty().ifEmpty { gym?.optString("startTime").orEmpty() }.ifEmpty { "19:00" },
      ),
      sleep = SleepSchedule(
        enabled = sleep?.optBoolean("enabled", false) ?: false,
        bedTime = sleep?.optString("bedTime", "23:30") ?: "23:30",
        wakeTime = sleep?.optString("wakeTime", "07:00") ?: "07:00",
      ),
      allowedApps = o.optJSONArray("allowedApps").toStrings().toSet(),
      lockMinutes = o.optInt("lockMinutes", 120),
    )
  }

  private fun <T> JSONArray?.toList(f: (JSONObject) -> T): List<T> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { optJSONObject(it)?.let(f) }
  }

  private fun JSONArray?.toInts(): List<Int> =
    if (this == null) emptyList() else (0 until length()).map { optInt(it, -1) }.filter { it >= 0 }

  private fun JSONArray?.toStrings(): List<String> =
    if (this == null) emptyList() else (0 until length()).map { optString(it) }.filter { it.isNotEmpty() }
}
