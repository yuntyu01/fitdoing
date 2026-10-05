package expo.modules.lockengine.core

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 마감·취침·헬스 시각, until 도달 시각에 깨어나 스케줄을 다시 평가한다. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    LockEngine.sync(context)
  }

  companion object {
    const val ACTION_TICK = "expo.modules.lockengine.TICK"
  }
}
