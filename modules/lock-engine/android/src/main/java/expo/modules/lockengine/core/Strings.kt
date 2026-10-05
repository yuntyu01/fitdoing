package expo.modules.lockengine.core

import expo.modules.lockengine.core.logic.LockType
import java.util.Locale

/** 네이티브 화면 문구. RN i18n 과 독립이라 기기 언어(ko/그 외 en)만 본다. */
object Strings {
  private val ko get() = Locale.getDefault().language == "ko"

  val title get() = if (ko) "잠금 중" else "Locked"
  val capture get() = if (ko) "지금 찍어서 풀기" else "Take a photo to unlock"
  val phone get() = if (ko) "전화" else "Phone"
  val sms get() = if (ko) "문자" else "Messages"
  val maps get() = if (ko) "지도" else "Maps"
  val kakao get() = if (ko) "카카오톡" else "KakaoTalk"
  val emergency get() = if (ko) "비상 해제" else "Emergency release"
  val remaining get() = if (ko) "남은 시간" else "Time left"

  fun reason(type: LockType?): String = when (type) {
    LockType.MEAL -> if (ko) "끼니 기록 마감이 지났어요" else "A meal deadline has passed"
    LockType.GYM -> if (ko) "헬스장에 도착하면 풀려요" else "Unlocks when you arrive at the gym"
    LockType.SLEEP -> if (ko) "자는 시간이에요. 기상 시각에 풀려요" else "Time to sleep. Unlocks at wake-up time"
    null -> ""
  }

  val serviceTitle get() = if (ko) "FitDoing 잠금 중" else "FitDoing lock active"
  fun serviceText(untilHHmm: String) = if (ko) "$untilHHmm 까지 잠겨 있어요" else "Locked until $untilHHmm"
  val channelName get() = if (ko) "잠금 상태" else "Lock status"
}
