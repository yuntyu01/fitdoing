package expo.modules.lockengine.core

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import expo.modules.lockengine.core.logic.BlockPolicy
import expo.modules.lockengine.core.logic.ForegroundTracker
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 잠금이 걸려 있는 동안만 도는 포그라운드 서비스. UsageStatsManager 를 폴링해 포그라운드 앱을 보고,
 * 차단 대상이면 [LockActivity] 로 덮는다. 잠금이 모두 풀리면 스스로 멈춘다(시작은 알람/부팅/브리지가 한다).
 */
class LockService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val tracker = ForegroundTracker()
  private var lastPollEnd = 0L
  private var lastLaunch = 0L
  private var tickCount = 0

  private val loop = object : Runnable {
    override fun run() {
      if (!tick()) {
        stopSelf()
        return
      }
      handler.postDelayed(this, POLL_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startAsForeground(LockEngine.activeLocks(this).minOfOrNull { it.until })
    handler.removeCallbacks(loop)
    handler.post(loop)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(loop)
    super.onDestroy()
  }

  /** @return 계속 돌아야 하면 true */
  private fun tick(): Boolean {
    val now = System.currentTimeMillis()
    val active = LockEngine.activeLocks(this, now)
    if (active.isEmpty()) return false
    // 5초마다 한 번 스케줄도 다시 평가한다(알람이 늦어졌을 때의 안전망).
    if (++tickCount % 10 == 0) LockEngine.sync(this, now)

    pollForeground(now)
    val pkg = tracker.current
    val block = BlockPolicy.shouldBlock(pkg, active, packageName, AllowedApps.resolve(this), LockEngine.allowedApps(this))
    if (block && now - lastLaunch > RELAUNCH_MS) {
      lastLaunch = now
      launchLockScreen()
    }
    return true
  }

  private fun pollForeground(now: Long) {
    // 처음엔 최근 10분을 훑어 "이미 열려 있는 앱"을 찾는다.
    val begin = if (lastPollEnd == 0L) now - 10 * 60_000L else lastPollEnd - 1_000L
    try {
      val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val events = usm.queryEvents(begin, now)
      val e = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(e)
        when (e.eventType) {
          UsageEvents.Event.ACTIVITY_RESUMED -> tracker.onResumed(e.packageName, e.timeStamp) // = MOVE_TO_FOREGROUND(1)
          UsageEvents.Event.ACTIVITY_PAUSED -> tracker.onPaused(e.packageName, e.timeStamp) // = MOVE_TO_BACKGROUND(2)
        }
      }
      lastPollEnd = now
    } catch (e: SecurityException) {
      // 사용 기록 접근 권한이 없다. 감지는 못 하지만 잠금 상태 자체는 유지한다.
      Log.w(TAG, "usage access not granted")
    }
  }

  private fun launchLockScreen() {
    try {
      startActivity(
        Intent(this, LockActivity::class.java)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
      )
    } catch (e: Exception) {
      // 오버레이 권한이 없으면 Android 10+ 가 백그라운드 Activity 시작을 막을 수 있다.
      Log.w(TAG, "cannot start LockActivity", e)
    }
  }

  private fun startAsForeground(untilMs: Long?) {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, Strings.channelName, NotificationManager.IMPORTANCE_LOW))
      Notification.Builder(this, CHANNEL)
    } else {
      @Suppress("DEPRECATION") Notification.Builder(this)
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val until = untilMs?.let { SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(it)) } ?: ""
    val n = b.setSmallIcon(android.R.drawable.ic_lock_idle_lock)
      .setContentTitle(Strings.serviceTitle)
      .setContentText(Strings.serviceText(until))
      .setOngoing(true)
      .setContentIntent(open)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTI_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTI_ID, n)
    }
  }

  private companion object {
    const val TAG = "LockService"
    const val CHANNEL = "lock_engine_status"
    const val NOTI_ID = 7101
    const val POLL_MS = 500L
    const val RELAUNCH_MS = 1_500L
  }
}
