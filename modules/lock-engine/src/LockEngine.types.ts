export type LockType = 'meal' | 'gym' | 'sleep';

/** action: 행동으로 해제(끼니 사진 저장, 헬스장 도착) / time: 시간 경과 / emergency / coupon */
export type ReleasedBy = 'action' | 'time' | 'emergency' | 'coupon';

export interface ActiveLock {
  type: LockType;
  startedAt: number; // epoch ms
  until: number; // epoch ms
  allowedPackages: string[];
}

export interface LockState {
  locked: boolean;
  locks: ActiveLock[];
  /** setSchedule 로 스케줄이 한 번이라도 저장되었는지 */
  hasSchedule: boolean;
}

export interface LockStartedEvent {
  type: LockType;
  startedAt: number;
  until: number;
}

export interface LockReleasedEvent extends LockStartedEvent {
  releasedBy: ReleasedBy;
  endedAt: number;
}

/** 앱이 죽어 있는 동안 생긴 이벤트. drainEventLog() 로 읽으면 비워진다. */
export type LoggedLockEvent =
  | (LockStartedEvent & { event: 'onLockStarted' })
  | (LockReleasedEvent & { event: 'onLockReleased' });

export type PermissionKind =
  | 'usageAccess' // 사용 기록 접근 (포그라운드 앱 감지)
  | 'overlay' // 다른 앱 위에 표시 (백그라운드에서 잠금 화면 띄우기)
  | 'exactAlarm' // 정확한 알람
  | 'batteryOptimization' // 배터리 최적화 예외
  | 'notifications';

export type PermissionStatus = Record<PermissionKind, boolean>;

export interface LaunchableApp {
  packageName: string;
  label: string;
}

/**
 * setSchedule 에 넘기는 설정. 앱의 Settings(app/src/db/schema.ts) 를 그대로 JSON.stringify 해서 넘겨도 된다.
 * 잠금 엔진은 아래 필드만 읽고 나머지는 무시한다. 칼로리·영양 목표는 읽지 않는다(칼로리 초과로는 잠그지 않는다).
 */
export interface LockScheduleSettings {
  mode: 'mild' | 'normal' | 'spicy'; // mild 는 잠그지 않는다
  meals: { index: number; deadline: string }[]; // 'HH:mm'
  gym: { enabled: boolean; days: number[]; arriveBy: string }; // days: 0=월 ... 6=일
  sleep: { enabled: boolean; bedTime: string; wakeTime: string };
  allowedApps: string[];
  lockMinutes: number;
}

export interface SetScheduleOptions {
  /** 이미 시작된 구간(과거 마감)은 해결된 것으로 본다. 온보딩 직후 첫 setSchedule 에 쓴다. */
  ignoreStarted?: boolean;
}

export type LockEngineEvents = {
  onLockStarted: (e: LockStartedEvent) => void;
  onLockReleased: (e: LockReleasedEvent) => void;
};
