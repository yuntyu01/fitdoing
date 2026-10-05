package expo.modules.lockengine.core

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object AlarmScheduler {
  private const val REQ = 7101

  private fun pending(ctx: Context): PendingIntent =
    PendingIntent.getBroadcast(
      ctx, REQ, Intent(ctx, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_TICK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  fun canExact(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()

  /** triggerAtMs 에 AlarmReceiver 를 깨운다. null 이면 취소. 정확한 알람 권한이 없으면 근사 알람(Doze 허용)으로 낮춘다. */
  fun set(ctx: Context, triggerAtMs: Long?) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = pending(ctx)
    if (triggerAtMs == null) {
      am.cancel(pi)
      return
    }
    try {
      if (canExact(ctx)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi)
      else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi)
    } catch (_: SecurityException) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi)
    }
  }
}
