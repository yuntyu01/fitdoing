package expo.modules.lockengine.core.logic

/** 걸려 있는 잠금(종류별 최대 1개). 영속화는 바깥 계층이 한다. */
class LockRegistry(initial: Collection<LockRecord> = emptyList()) {
  private val records = LinkedHashMap<LockType, LockRecord>().apply { initial.forEach { put(it.type, it) } }

  fun all(): List<LockRecord> = records.values.toList()

  fun active(nowMs: Long): List<LockRecord> = records.values.filter { it.until > nowMs }

  fun isLocked(nowMs: Long): Boolean = active(nowMs).isNotEmpty()

  /** 표시용: 가장 먼저 풀리는 잠금의 until. 잠금이 없으면 null. */
  fun nearestUntil(nowMs: Long): Long? = active(nowMs).minOfOrNull { it.until }

  data class StartResult(val record: LockRecord, val isNew: Boolean)

  /** until 이 이미 지났으면 null. 같은 종류가 있으면 until 은 더 늦은 쪽으로 합친다. */
  fun start(
    type: LockType,
    until: Long,
    allowed: Set<String>,
    nowMs: Long,
    key: String? = null,
  ): StartResult? {
    if (until <= nowMs) return null
    val old = records[type]?.takeIf { it.until > nowMs }
    val rec = if (old == null) {
      LockRecord(type, nowMs, until, allowed, key)
    } else {
      old.copy(until = maxOf(old.until, until), allowedPackages = allowed, key = key ?: old.key)
    }
    records[type] = rec
    return StartResult(rec, old == null)
  }

  fun release(type: LockType): LockRecord? = records.remove(type)

  /** until 이 지난 잠금을 꺼내 돌려준다. */
  fun expire(nowMs: Long): List<LockRecord> {
    val gone = records.values.filter { it.until <= nowMs }
    gone.forEach { records.remove(it.type) }
    return gone
  }
}
