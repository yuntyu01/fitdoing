import { create } from 'zustand';

import { allowedPackages, decideLock, type ActiveLock, type LockType } from '../../domain/lock';
import { useSettings } from '../settings/store';
import { getCouponPort } from './couponPort';
import { getLockEngine } from './engine';
import { closeStale, ensureStarted, loadSnapshot } from './records';

interface LockState {
  /** 지금 걸려 있는 잠금 (순한맛이면 항상 null) */
  active: ActiveLock | null;
  /** 순한맛: 잠금 대신 알림만 할 잠금 */
  notifyOnly: ActiveLock | null;
  emergencyLeft: number;
  restLeft: number;
  /** 판정 시각 갱신용 */
  version: number;
  /** 지금 시각으로 다시 판정한다. 앱 시작·포그라운드 복귀·알림 탭·기록 변경 때 부른다. */
  refresh: (now?: Date) => ActiveLock | null;
}

// 엔진에 마지막으로 건 잠금. 같은 잠금을 반복해서 걸지 않는다.
let engineLock: { type: LockType; startedAt: number } | null = null;

export const useLock = create<LockState>((set, get) => ({
  active: null,
  notifyOnly: null,
  emergencyLeft: 0,
  restLeft: 0,
  version: 0,

  refresh: (now = new Date()) => {
    const settings = useSettings.getState().settings;
    if (!settings) return null;

    const decision = decideLock(loadSnapshot(settings, now));
    if (decision.lock) ensureStarted(decision.lock);
    closeStale(decision.lock, settings, now);

    const engine = getLockEngine();
    const lock = decision.lock;
    if (lock) {
      if (engineLock?.type !== lock.type || engineLock.startedAt !== lock.startedAt) {
        engineLock = { type: lock.type, startedAt: lock.startedAt };
        engine.startLock(lock.type, lock.until, allowedPackages(settings.allowedApps)).catch(() => {});
      }
    } else if (engineLock) {
      engine.releaseLock(engineLock.type).catch(() => {});
      engineLock = null;
    }

    const port = getCouponPort();
    set({
      active: lock,
      notifyOnly: decision.notifyOnly,
      emergencyLeft: port.remaining('emergency', settings.emergencyPerWeek, now),
      restLeft: port.remaining('rest', settings.coupons.rest, now),
      version: get().version + 1,
    });
    return lock;
  },
}));

/** 엔진에 걸어 둔 잠금 기억을 비운다 (해제 직후 같은 키가 다시 걸려야 할 때) */
export function forgetEngineLock() {
  engineLock = null;
}
