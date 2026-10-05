package expo.modules.lockengine.core

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.AlarmClock
import android.provider.Telephony
import android.view.inputmethod.InputMethodManager

/** 항상 허용하는 앱(런처·전화·문자·지도·알람·키보드)을 기기에서 찾는다. 패키지 가시성은 plugin 이 <queries> 로 연다. */
object AllowedApps {
  @Volatile private var cache: Set<String> = emptySet()
  @Volatile private var cachedAt = 0L

  fun resolve(ctx: Context): Set<String> {
    val now = System.currentTimeMillis()
    if (now - cachedAt < 60_000 && cache.isNotEmpty()) return cache
    val pm = ctx.packageManager
    val out = HashSet<String>()
    fun add(intent: Intent) {
      try {
        pm.queryIntentActivities(intent, 0).forEach { out += it.activityInfo.packageName }
      } catch (_: Exception) {}
    }
    add(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))
    add(Intent(Intent.ACTION_DIAL))
    add(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")))
    add(Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0")))
    add(Intent(AlarmClock.ACTION_SHOW_ALARMS))
    try { Telephony.Sms.getDefaultSmsPackage(ctx)?.let { out += it } } catch (_: Exception) {}
    try {
      val imm = ctx.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      imm.enabledInputMethodList.forEach { out += it.packageName }
    } catch (_: Exception) {}
    out += ctx.packageName
    cache = out
    cachedAt = now
    return out
  }

  /** 설정에서 앱을 고를 때 쓰는 목록: 런처에 보이는 앱(자기 자신 제외). */
  fun launchable(ctx: Context): List<Pair<String, String>> {
    val pm = ctx.packageManager
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    return pm.queryIntentActivities(intent, 0)
      .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
      .filter { it.first != ctx.packageName }
      .distinctBy { it.first }
      .sortedBy { it.second.lowercase() }
  }
}
