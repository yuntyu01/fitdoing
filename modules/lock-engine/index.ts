import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

import type {
  LaunchableApp,
  LockReleasedEvent,
  LockScheduleSettings,
  LockStartedEvent,
  LockState,
  LockType,
  LoggedLockEvent,
  PermissionKind,
  PermissionStatus,
  ReleasedBy,
  SetScheduleOptions,
} from './src/LockEngine.types';

export * from './src/LockEngine.types';

/** Android 전용. iOS·웹·Expo Go 에서는 네이티브 모듈이 없어 null 이고, 아래 함수들은 안전한 기본값을 돌려준다. */
interface NativeLockEngine {
  startLock(type: LockType, untilEpochMs: number, allowedPackages: string[]): Promise<boolean>;
  releaseLock(type: LockType, releasedBy?: ReleasedBy | null): Promise<boolean>;
  releaseAll(releasedBy?: ReleasedBy | null): Promise<number>;
  getLockState(): Promise<LockState>;
  setSchedule(settingsJson: string, ignoreStarted?: boolean | null): Promise<void>;
  markDone(type: LockType, dayKey: string, index?: number | null): Promise<void>;
  drainEventLog(): Promise<LoggedLockEvent[]>;
  getPermissionStatus(): Promise<PermissionStatus>;
  openPermissionSettings(kind: PermissionKind): Promise<boolean>;
  openVendorBatterySettings(): Promise<string>;
  getLaunchableApps(): Promise<LaunchableApp[]>;
  addListener(name: 'onLockStarted', cb: (e: LockStartedEvent) => void): EventSubscription;
  addListener(name: 'onLockReleased', cb: (e: LockReleasedEvent) => void): EventSubscription;
}

const native = requireOptionalNativeModule<NativeLockEngine>('LockEngine');

const NO_PERMISSIONS: PermissionStatus = {
  usageAccess: false,
  overlay: false,
  exactAlarm: false,
  batteryOptimization: false,
  notifications: false,
};

/** 네이티브 잠금 엔진을 쓸 수 있는가 (Android dev client / 빌드). */
export const isAvailable = native != null;

/** 지금 즉시 잠근다. until 은 epoch ms. allowedPackages 는 전화·문자·지도·알람·본 앱 외에 추가로 허용할 앱. */
export async function startLock(type: LockType, untilEpochMs: number, allowedPackages: string[] = []): Promise<boolean> {
  return native ? native.startLock(type, untilEpochMs, allowedPackages) : false;
}

/** 잠금을 푼다. 끼니 사진 저장·지오펜스 도착·비상·쿠폰은 모두 앱(JS)이 이걸 부른다. 풀린 게 있으면 true. */
export async function releaseLock(type: LockType, releasedBy: ReleasedBy = 'action'): Promise<boolean> {
  return native ? native.releaseLock(type, releasedBy) : false;
}

/** 걸린 잠금을 전부 푼다(비상 해제 등). 푼 개수. */
export async function releaseAll(releasedBy: ReleasedBy = 'emergency'): Promise<number> {
  return native ? native.releaseAll(releasedBy) : 0;
}

export async function getLockState(): Promise<LockState> {
  return native ? native.getLockState() : { locked: false, locks: [], hasSchedule: false };
}

/** 설정이 바뀔 때마다 부른다. 이후 마감·취침·헬스 시각은 앱이 꺼져 있어도 네이티브가 알람으로 처리한다. */
export async function setSchedule(
  settings: LockScheduleSettings | object,
  options: SetScheduleOptions = {},
): Promise<void> {
  if (native) await native.setSchedule(JSON.stringify(settings), options.ignoreStarted ?? false);
}

/**
 * 끼니 마감 전에 기록했거나 헬스를 미리 해결했을 때 부른다(그 구간은 잠기지 않는다).
 * dayKey 는 'YYYY-MM-DD' (끼니는 1끼 기준 날짜, 헬스는 그날, 취침은 취침 시각이 속한 날). 끼니는 index(1부터) 필수.
 */
export async function markDone(type: LockType, dayKey: string, index?: number): Promise<void> {
  if (native) await native.markDone(type, dayKey, index ?? null);
}

/** 앱이 죽어 있는 동안 네이티브가 쌓아 둔 잠금 이벤트(LockEvent 기록용). 시작할 때 한 번 읽어 DB 에 반영한다. */
export async function drainEventLog(): Promise<LoggedLockEvent[]> {
  return native ? native.drainEventLog() : [];
}

export function addLockStartedListener(cb: (e: LockStartedEvent) => void): EventSubscription {
  return native ? native.addListener('onLockStarted', cb) : { remove() {} };
}

export function addLockReleasedListener(cb: (e: LockReleasedEvent) => void): EventSubscription {
  return native ? native.addListener('onLockReleased', cb) : { remove() {} };
}

// --- 권한 -------------------------------------------------------------------------------

export async function getPermissionStatus(): Promise<PermissionStatus> {
  return native ? native.getPermissionStatus() : NO_PERMISSIONS;
}

/**
 * 해당 설정 화면을 연다. 사용자가 돌아온 뒤의 결과는 알 수 없으니 앱이 다시 활성화될 때 getPermissionStatus 를 다시 읽는다.
 * 'notifications' 의 런타임 허용 팝업은 expo-notifications 가 담당하고, 이건 시스템 알림 설정 화면을 연다.
 */
export async function openPermissionSettings(kind: PermissionKind): Promise<boolean> {
  return native ? native.openPermissionSettings(kind) : false;
}

/** 삼성·샤오미의 제조사 배터리 화면(없으면 표준 배터리 최적화 목록)을 연다. 연 대상을 문자열로 돌려준다. */
export async function openVendorBatterySettings(): Promise<string> {
  return native ? native.openVendorBatterySettings() : 'none';
}

/** 설정에서 "허용할 앱"을 고를 때 쓰는 런처 앱 목록(본 앱 제외). */
export async function getLaunchableApps(): Promise<LaunchableApp[]> {
  return native ? native.getLaunchableApps() : [];
}
