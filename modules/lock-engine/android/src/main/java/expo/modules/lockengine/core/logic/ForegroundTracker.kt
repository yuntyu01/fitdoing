package expo.modules.lockengine.core.logic

/**
 * UsageEvents 스트림(ACTIVITY_RESUMED/PAUSED = MOVE_TO_FOREGROUND/BACKGROUND)에서 현재 포그라운드 패키지를 추적한다.
 * 같은 이벤트를 겹쳐 다시 넣어도 결과는 같다(시각 역행 이벤트는 무시).
 */
class ForegroundTracker {
  var current: String? = null
    private set
  private var lastTs = Long.MIN_VALUE

  fun onResumed(pkg: String, ts: Long) {
    if (ts < lastTs) return
    lastTs = ts
    current = pkg
  }

  fun onPaused(pkg: String, ts: Long) {
    if (ts < lastTs) return
    lastTs = ts
    if (current == pkg) current = null
  }
}
