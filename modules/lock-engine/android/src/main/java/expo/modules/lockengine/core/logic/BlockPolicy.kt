package expo.modules.lockengine.core.logic

object BlockPolicy {
  /** 항상 허용하는 시스템 패키지(런처·전화·문자·지도·알람은 기기에서 동적으로 찾은 것과 합친다). */
  val FALLBACK_ALWAYS_ALLOWED: Set<String> = setOf(
    "android",
    "com.android.systemui",
    // Users must always be able to review/revoke FitDoing permissions or uninstall it.
    "com.android.settings",
    "com.android.permissioncontroller",
    "com.google.android.permissioncontroller",
    // 전화
    "com.android.phone", "com.android.server.telecom", "com.android.incallui", "com.samsung.android.incallui",
    "com.android.dialer", "com.google.android.dialer", "com.samsung.android.dialer", "com.android.emergency",
    "com.android.contacts", "com.google.android.contacts", "com.samsung.android.app.contacts",
    // 문자
    "com.android.mms", "com.google.android.apps.messaging", "com.samsung.android.messaging",
    // 지도
    "com.google.android.apps.maps", "com.nhn.android.nmap", "net.daum.maps", "com.skt.tmap", "com.kakao.map",
    // 카카오톡
    "com.kakao.talk",
    // 알람
    "com.google.android.deskclock", "com.android.deskclock", "com.sec.android.app.clockpackage",
  )

  /**
   * [pkg] 가 포그라운드로 왔을 때 잠금 화면으로 덮어야 하는가.
   * - 걸린 잠금이 없으면 false.
   * - 기본 허용(own, 런처/전화/문자/지도/알람 등 [baseAllowed])이면 false.
   * - 걸린 잠금 하나라도 해당 패키지를 허용 목록에 넣지 않았으면 true. 목록 = 잠금별 allowedPackages + 설정의 [userAllowed].
   */
  fun shouldBlock(
    pkg: String?,
    active: Collection<LockRecord>,
    ownPackage: String,
    baseAllowed: Set<String>,
    userAllowed: Set<String>,
  ): Boolean {
    if (pkg == null || active.isEmpty()) return false
    if (pkg == ownPackage || pkg in baseAllowed || pkg in FALLBACK_ALWAYS_ALLOWED || pkg in userAllowed) return false
    return active.any { pkg !in it.allowedPackages }
  }
}
