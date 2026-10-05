package expo.modules.lockengine.core.logic

import org.json.JSONArray
import org.json.JSONObject

/** 영속화용 직렬화. SharedPreferences 에는 문자열로만 저장한다. */
object LockCodec {
  fun recordToJson(r: LockRecord): JSONObject = JSONObject()
    .put("type", r.type.id)
    .put("startedAt", r.startedAt)
    .put("until", r.until)
    .put("allowedPackages", JSONArray(r.allowedPackages.toList()))
    .put("key", r.key ?: JSONObject.NULL)

  fun recordFromJson(o: JSONObject): LockRecord? {
    val type = LockType.parse(o.optString("type")) ?: return null
    val arr = o.optJSONArray("allowedPackages")
    return LockRecord(
      type = type,
      startedAt = o.optLong("startedAt"),
      until = o.optLong("until"),
      allowedPackages = if (arr == null) emptySet() else (0 until arr.length()).map { arr.optString(it) }.toSet(),
      key = if (o.isNull("key")) null else o.optString("key"),
    )
  }

  fun recordsToString(list: Collection<LockRecord>): String =
    JSONArray(list.map { recordToJson(it) }).toString()

  fun recordsFromString(s: String?): List<LockRecord> {
    if (s.isNullOrEmpty()) return emptyList()
    return try {
      val a = JSONArray(s)
      (0 until a.length()).mapNotNull { a.optJSONObject(it)?.let(::recordFromJson) }
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun setToString(s: Set<String>): String = JSONArray(s.toList()).toString()

  fun setFromString(s: String?): Set<String> {
    if (s.isNullOrEmpty()) return emptySet()
    return try {
      val a = JSONArray(s)
      (0 until a.length()).map { a.optString(it) }.toSet()
    } catch (_: Exception) {
      emptySet()
    }
  }
}
