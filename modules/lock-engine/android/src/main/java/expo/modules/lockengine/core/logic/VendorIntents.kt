package expo.modules.lockengine.core.logic

data class ComponentSpec(val pkg: String, val cls: String)

/** 제조사별 배터리·자동 시작 설정 화면 후보. 위에서부터 시도한다. 실제 존재 여부는 Android 쪽에서 확인. */
object VendorIntents {
  fun batteryCandidates(manufacturer: String): List<ComponentSpec> = when (manufacturer.lowercase()) {
    "samsung" -> listOf(
      ComponentSpec("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"),
      ComponentSpec("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),
      ComponentSpec("com.samsung.android.sm_cn", "com.samsung.android.sm.ui.battery.BatteryActivity"),
    )
    "xiaomi", "redmi", "poco" -> listOf(
      ComponentSpec("com.miui.powerkeeper", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity"),
      ComponentSpec("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
    )
    else -> emptyList()
  }
}
