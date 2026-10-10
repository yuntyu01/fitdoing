import * as NativeModule from '../../../../modules/lock-engine';
import type { Settings } from '../../db/schema';
import { allowedPackages, type LockType } from '../../domain/lock';

// 네이티브 잠금 엔진(modules/lock-engine, SPEC §7)의 얇은 어댑터.
// 모듈이 로드되면 그걸 쓰고, 안 되면(웹·jest·네이티브 미빌드) 메모리 폴백으로 동작한다.
// 판정은 JS(domain/lock.ts)가 하고, 엔진에는 "이 앱들을 이 시각까지 막아라"만 전한다.

export interface NativeLockState {
  type: LockType;
  untilEpochMs: number;
}

export interface LockEngineEvent {
  type: LockType;
  /** 엔진이 알려주는 해제 이유. 지오펜스 진입은 'action'으로 온다. */
  releasedBy?: 'action' | 'time' | 'emergency' | 'coupon';
}

export interface LoggedEngineEvent extends LockEngineEvent {
  event: 'onLockStarted' | 'onLockReleased';
  startedAt: number;
  until: number;
  endedAt?: number;
}

export interface LockEngine {
  readonly native: boolean;
  startLock(type: LockType, untilEpochMs: number, allowedPackages: string[]): Promise<void>;
  releaseLock(type: LockType, by?: NativeModule.ReleasedBy): Promise<void>;
  getLockState(): Promise<NativeLockState[]>;
  /** 설정 + 허용 패키지. 엔진이 앱이 꺼져 있어도 알람으로 잠그도록 일정을 넘긴다. */
  setSchedule(settings: Settings, ignoreStarted?: boolean): Promise<void>;
  /** 끼니를 마감 전에 기록했거나 헬스를 해결했을 때: 그 구간은 앱이 꺼져 있어도 잠기지 않는다. */
  markDone(type: LockType, dayKey: string, index?: number): Promise<void>;
  /** 앱이 꺼져 있는 동안 네이티브가 쌓아 둔 잠금 이벤트 */
  drainEventLog(): Promise<LoggedEngineEvent[]>;
  onLockStarted(cb: (e: LockEngineEvent) => void): { remove: () => void };
  onLockReleased(cb: (e: LockEngineEvent) => void): { remove: () => void };
}

type Listener = (e: LockEngineEvent) => void;

function memoryEngine(): LockEngine {
  const state = new Map<LockType, number>();
  const started = new Set<Listener>();
  const released = new Set<Listener>();
  const sub = (set: Set<Listener>, cb: Listener) => {
    set.add(cb);
    return { remove: () => void set.delete(cb) };
  };
  return {
    native: false,
    async startLock(type, untilEpochMs) {
      state.set(type, untilEpochMs);
      started.forEach((cb) => cb({ type }));
    },
    async releaseLock(type) {
      if (state.delete(type)) released.forEach((cb) => cb({ type }));
    },
    async getLockState() {
      return [...state].map(([type, untilEpochMs]) => ({ type, untilEpochMs }));
    },
    async setSchedule() {},
    async markDone() {},
    async drainEventLog() {
      return [];
    },
    onLockStarted: (cb) => sub(started, cb),
    onLockReleased: (cb) => sub(released, cb),
  };
}

// 모듈 모양은 export 방식(named/default)에 상관없이 받는다.
interface RawModule {
  startLock?: (type: string, until: number, allowed: string[]) => unknown;
  releaseLock?: (type: string, by?: NativeModule.ReleasedBy) => unknown;
  getLockState?: () => unknown;
  setSchedule?: (settings: unknown, options?: { ignoreStarted?: boolean }) => unknown;
  markDone?: (type: string, dayKey: string, index?: number) => unknown;
  drainEventLog?: () => unknown;
  addLockStartedListener?: (cb: (e: LockEngineEvent) => void) => { remove: () => void };
  addLockReleasedListener?: (cb: (e: LockEngineEvent) => void) => { remove: () => void };
  addListener?: (event: string, cb: (e: LockEngineEvent) => void) => { remove: () => void };
  onLockStarted?: (cb: (e: LockEngineEvent) => void) => { remove: () => void };
  onLockReleased?: (cb: (e: LockEngineEvent) => void) => { remove: () => void };
}

function loadNative(): RawModule | null {
  // A static import makes a broken path fail the build instead of silently disabling locking.
  return NativeModule.isAvailable ? (NativeModule as unknown as RawModule) : null;
}

function nativeEngine(m: RawModule): LockEngine {
  const on = (event: 'onLockStarted' | 'onLockReleased', cb: Listener) => {
    try {
      const direct = event === 'onLockStarted' ? m.addLockStartedListener ?? m.onLockStarted : m.addLockReleasedListener ?? m.onLockReleased;
      if (typeof direct === 'function') return direct.call(m, cb);
      if (typeof m.addListener === 'function') return m.addListener(event, cb);
    } catch {
      // 이벤트를 못 받아도 앱 시작·포그라운드 복귀 때 다시 판정하므로 괜찮다.
    }
    return { remove: () => {} };
  };
  // 네이티브 호출이 던져도 JS 판정·화면은 계속 돌아야 한다.
  const safe = async <T,>(fn: () => unknown, fallback: T): Promise<T> => {
    try {
      return ((await fn()) as T) ?? fallback;
    } catch (e) {
      console.warn('lock-engine call failed', e);
      return fallback;
    }
  };
  return {
    native: true,
    startLock: (type, until, allowed) => safe(() => m.startLock!(type, until, allowed), undefined),
    releaseLock: (type, by = 'action') => safe(() => m.releaseLock?.(type, by), undefined),
    // 모듈은 {locked, locks:[{type, until}]} 로 돌려준다. 어댑터 계약(NativeLockState[])으로 바꾼다.
    getLockState: () =>
      safe(async () => {
        const st = (await m.getLockState?.()) as { locks?: { type: LockType; until: number }[] } | NativeLockState[] | undefined;
        if (Array.isArray(st)) return st;
        return (st?.locks ?? []).map((l) => ({ type: l.type, untilEpochMs: l.until }));
      }, [] as NativeLockState[]),
    setSchedule: (settings, ignoreStarted = false) =>
      safe(async () => {
        const state = (await m.getLockState?.()) as { hasSchedule?: boolean } | undefined;
        await m.setSchedule?.({ ...settings, allowedPackages: allowedPackages(settings.allowedApps) },
          { ignoreStarted: ignoreStarted || state?.hasSchedule === false });
      }, undefined),
    markDone: (type, dayKey, index) => safe(() => m.markDone?.(type, dayKey, index), undefined),
    drainEventLog: () => safe(() => m.drainEventLog?.(), [] as LoggedEngineEvent[]),
    onLockStarted: (cb) => on('onLockStarted', cb),
    onLockReleased: (cb) => on('onLockReleased', cb),
  };
}

let instance: LockEngine | null = null;

export function getLockEngine(): LockEngine {
  if (!instance) {
    const m = loadNative();
    instance = m ? nativeEngine(m) : memoryEngine();
  }
  return instance;
}

/** 테스트에서 엔진을 바꿔 끼울 때만 쓴다 */
export function setLockEngineForTest(e: LockEngine | null) {
  instance = e;
}
