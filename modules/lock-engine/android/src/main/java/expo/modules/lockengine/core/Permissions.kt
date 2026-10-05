package expo.modules.lockengine.core

import android.app.AppOpsManager
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.lockengine.core.logic.VendorIntents

object Permissions {
  val KINDS = listOf("usageAccess", "overlay", "exactAlarm", "batteryOptimization", "notifications")

  fun status(ctx: Context): Map<String, Boolean> = mapOf(
    "usageAccess" to usageAccess(ctx),
    "overlay" to Settings.canDrawOverlays(ctx),
    "exactAlarm" to AlarmScheduler.canExact(ctx),
    "batteryOptimization" to (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager)
      .isIgnoringBatteryOptimizations(ctx.packageName),
    "notifications" to (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled(),
  )

  fun usageAccess(ctx: Context): Boolean {
    val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), ctx.packageName)
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), ctx.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  /** 해당 설정 화면을 연다. 결과는 알 수 없으니 JS 는 앱이 다시 활성화될 때 status() 를 다시 읽는다. */
  fun open(ctx: Context, kind: String): Boolean {
    val pkgUri = Uri.parse("package:${ctx.packageName}")
    val intents = when (kind) {
      "usageAccess" -> listOf(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).setData(pkgUri), Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
      "overlay" -> listOf(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkgUri))
      "exactAlarm" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) listOf(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkgUri)) else emptyList()
      "batteryOptimization" -> listOf(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkgUri),
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
      )
      "notifications" -> listOf(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName))
      else -> emptyList()
    }
    return intents.any { start(ctx, it) }
  }

  /** 삼성·샤오미의 제조사 배터리/자동 시작 화면. 후보가 없거나 열리지 않으면 표준 배터리 최적화 목록. */
  fun openVendorBattery(ctx: Context): String {
    for (c in VendorIntents.batteryCandidates(Build.MANUFACTURER)) {
      val i = Intent().setClassName(c.pkg, c.cls)
      if (start(ctx, i)) return "${c.pkg}/${c.cls}"
    }
    return if (start(ctx, Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) "standard" else "none"
  }

  private fun start(ctx: Context, intent: Intent): Boolean = try {
    ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (_: ActivityNotFoundException) {
    false
  } catch (_: SecurityException) {
    false
  }
}
