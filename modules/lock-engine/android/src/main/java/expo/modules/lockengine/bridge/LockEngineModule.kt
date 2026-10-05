package expo.modules.lockengine.bridge

import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.lockengine.core.AllowedApps
import expo.modules.lockengine.core.LockEngine
import expo.modules.lockengine.core.Permissions
import expo.modules.lockengine.core.logic.LockType
import expo.modules.lockengine.core.logic.ReleasedBy
import org.json.JSONArray
import org.json.JSONObject

/** Expo 브리지. 엔진 로직은 core 패키지에 있고 여기는 JS 계약만 맞춘다. */
class LockEngineModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context is not available", null)

  private fun type(id: String): LockType =
    LockType.parse(id) ?: throw CodedException("ERR_INVALID_TYPE", "Unknown lock type: $id", null)

  override fun definition() = ModuleDefinition {
    Name("LockEngine")

    Events("onLockStarted", "onLockReleased")

    OnCreate {
      LockEngine.listener = LockEngine.Listener { name, payload -> sendEvent(name, payload) }
      // 앱이 켜지는 즉시 스케줄을 다시 평가한다(알람이 막혔던 경우의 안전망).
      appContext.reactContext?.let { LockEngine.sync(it) }
    }
    OnDestroy { LockEngine.listener = null }

    AsyncFunction("startLock") { type: String, untilEpochMs: Double, allowedPackages: List<String> ->
      LockEngine.startLock(ctx, type(type), untilEpochMs.toLong(), allowedPackages.toSet())
    }

    AsyncFunction("releaseLock") { type: String, releasedBy: String? ->
      LockEngine.releaseLock(ctx, type(type), ReleasedBy.parse(releasedBy))
    }

    AsyncFunction("releaseAll") { releasedBy: String? ->
      LockEngine.releaseAll(ctx, ReleasedBy.parse(releasedBy))
    }

    AsyncFunction("getLockState") { LockEngine.snapshot(ctx) }

    AsyncFunction("setSchedule") { settingsJson: String, ignoreStarted: Boolean? ->
      try {
        LockEngine.setSchedule(ctx, settingsJson, ignoreStarted ?: false)
      } catch (e: org.json.JSONException) {
        throw CodedException("ERR_INVALID_SCHEDULE", "settings JSON is invalid: ${e.message}", e)
      }
    }

    AsyncFunction("markDone") { type: String, dayKey: String, index: Int? ->
      LockEngine.markDone(ctx, type(type), dayKey, index)
    }

    AsyncFunction("drainEventLog") {
      val a: JSONArray = LockEngine.drainEvents(ctx)
      (0 until a.length()).map { i -> jsonToMap(a.getJSONObject(i)) }
    }

    AsyncFunction("getPermissionStatus") { Permissions.status(ctx) }

    AsyncFunction("openPermissionSettings") { kind: String -> Permissions.open(ctx, kind) }

    AsyncFunction("openVendorBatterySettings") { Permissions.openVendorBattery(ctx) }

    AsyncFunction("getLaunchableApps") {
      AllowedApps.launchable(ctx).map { (pkg, label) -> mapOf("packageName" to pkg, "label" to label) }
    }
  }

  private fun jsonToMap(o: JSONObject): Map<String, Any?> =
    o.keys().asSequence().associateWith { k -> o.get(k).takeIf { it != JSONObject.NULL } }
}
