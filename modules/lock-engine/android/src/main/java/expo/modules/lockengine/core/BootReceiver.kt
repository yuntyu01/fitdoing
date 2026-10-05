package expo.modules.lockengine.core

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 부팅·앱 업데이트·시각/시간대 변경 뒤에 저장된 스케줄과 잠금 상태를 복구한다. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    LockEngine.sync(context)
  }
}
