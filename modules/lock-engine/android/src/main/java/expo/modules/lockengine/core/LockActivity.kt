package expo.modules.lockengine.core

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.lockengine.core.logic.LockRecord

/**
 * 잠금 화면(네이티브 레이아웃, 검정 #151515). 차단 앱이 포그라운드로 오면 [LockService] 가 띄운다.
 * 해제는 이 화면이 하지 않는다: "지금 찍어서 풀기"·"비상 해제"는 본 앱 화면으로 딥링크하고, 앱(JS)이 releaseLock 을 부른다.
 */
class LockActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var countdown: TextView
  private lateinit var reason: TextView

  private val tick = object : Runnable {
    override fun run() {
      val now = System.currentTimeMillis()
      val active = LockEngine.activeLocks(this@LockActivity, now)
      if (active.isEmpty()) {
        finishAndRemoveTask()
        return
      }
      render(active, now)
      handler.postDelayed(this, 1000)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
    window.statusBarColor = BG
    window.navigationBarColor = BG
    setContentView(buildLayout())
  }

  override fun onResume() {
    super.onResume()
    handler.post(tick)
  }

  override fun onPause() {
    handler.removeCallbacks(tick)
    super.onPause()
  }

  // 뒤로 가기로 잠금 화면을 걷어내지 못하게 홈으로 보낸다.
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  private fun render(active: List<LockRecord>, now: Long) {
    val first = active.minByOrNull { it.until }!!
    countdown.text = format(first.until - now)
    reason.text = Strings.reason(first.type)
  }

  private fun format(ms: Long): String {
    val s = (ms.coerceAtLeast(0) + 999) / 1000
    return "%02d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60)
  }

  // --- 레이아웃 (XML 대신 코드: 라이브러리 리소스 병합 없이 모듈 하나로 끝낸다) -----------------

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  private fun buildLayout(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(BG)
      setPadding(dp(24), dp(72), dp(24), dp(32))
      layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    }
    root.addView(text(Strings.title, 20f, Color.WHITE, bold = true))
    reason = text("", 15f, SUB).also { (it.layoutParams as LinearLayout.LayoutParams).topMargin = dp(8) }
    root.addView(reason)
    root.addView(text(Strings.remaining, 13f, SUB).also { (it.layoutParams as LinearLayout.LayoutParams).topMargin = dp(56) })
    countdown = text("--:--:--", 52f, Color.WHITE, bold = true).also {
      it.typeface = Typeface.MONOSPACE
      it.setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
      (it.layoutParams as LinearLayout.LayoutParams).topMargin = dp(8)
    }
    root.addView(countdown)

    root.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f)) // 여백

    root.addView(
      button(Strings.capture, filled = true) { openDeepLink(metaUri(META_CAPTURE, DEFAULT_CAPTURE)) },
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)),
    )
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    listOf<Pair<String, () -> Unit>>(
      Strings.phone to { startSafe(Intent(Intent.ACTION_DIAL)) },
      Strings.sms to { startSafe(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MESSAGING)) },
      Strings.maps to {
        startSafe(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MAPS), fallback = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0")))
      },
      Strings.kakao to { startSafe(packageManager.getLaunchIntentForPackage("com.kakao.talk") ?: Intent(Intent.ACTION_VIEW, Uri.parse("kakaotalk://"))) },
    ).forEachIndexed { i, (label, onClick) ->
      val lp = LinearLayout.LayoutParams(0, dp(52), 1f).apply { if (i > 0) marginStart = dp(8) }
      row.addView(button(label, filled = false) { onClick() }, lp)
    }
    root.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12) })

    val emergency = text(Strings.emergency, 14f, SUB).apply {
      setPadding(dp(16), dp(16), dp(16), dp(16))
      paintFlags = paintFlags or android.graphics.Paint.UNDERLINE_TEXT_FLAG
      setOnClickListener { openDeepLink(metaUri(META_EMERGENCY, DEFAULT_EMERGENCY)) }
    }
    root.addView(emergency)
    return root
  }

  private fun text(s: String, sp: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
    text = s
    textSize = sp
    setTextColor(color)
    gravity = Gravity.CENTER
    if (bold) setTypeface(typeface, Typeface.BOLD)
    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
  }

  private fun button(label: String, filled: Boolean, onClick: () -> Unit) = Button(this).apply {
    text = label
    isAllCaps = false
    textSize = 16f
    setTypeface(typeface, Typeface.BOLD)
    setTextColor(if (filled) BG else Color.WHITE)
    background = GradientDrawable().apply {
      cornerRadius = dp(14).toFloat()
      if (filled) setColor(Color.WHITE) else { setColor(Color.TRANSPARENT); setStroke(dp(1), 0xFF4E5968.toInt()) }
    }
    setOnClickListener { onClick() }
  }

  // --- 이동 ---------------------------------------------------------------------------

  private fun metaUri(key: String, default: String): String = try {
    val ai = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
    ai.metaData?.getString(key) ?: default
  } catch (_: Exception) {
    default
  }

  /** 본 앱(허용 목록)의 딥링크 화면으로 간다. 이 Activity 는 뒤에 남지만, 앱이 잠금을 풀면 스스로 닫는다. */
  private fun openDeepLink(uri: String) {
    startSafe(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(packageName))
  }

  private fun startSafe(intent: Intent, fallback: Intent? = null) {
    try {
      startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
      if (fallback != null) startSafe(fallback)
    }
  }

  companion object {
    private const val BG = 0xFF151515.toInt()
    private const val SUB = 0xFF8B95A1.toInt()
    const val META_CAPTURE = "expo.modules.lockengine.CAPTURE_URI"
    const val META_EMERGENCY = "expo.modules.lockengine.EMERGENCY_URI"
    const val DEFAULT_CAPTURE = "fitdoing://capture"
    const val DEFAULT_EMERGENCY = "fitdoing://emergency"
  }
}
