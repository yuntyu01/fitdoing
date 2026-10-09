import { getLockEngine } from './engine';
import { getCouponPort } from './couponPort';
import { useSettings } from '../settings/store';
import type { LockType } from '../../domain/lock';
import { closeOpen, markGymDone } from './records';
import { forgetEngineLock, useLock } from './store';

// 다른 기능(촬영·헬스 인증·쿠폰 시트)이 부르는 잠금 해제 API.
// 모두 동기로 DB에 기록하고, 엔진에 알리고, 판정을 다시 돌린다.

function finish(type: LockType, by: Parameters<typeof closeOpen>[1], now: Date, reason?: string | null) {
  closeOpen(type, by, now, reason);
  forgetEngineLock();
  getLockEngine()
    .releaseLock(type, by)
    .catch(() => {});
  useLock.getState().refresh(now);
}

/**
 * 끼니 사진 기록이 저장된 직후에 부른다. (촬영 기록 흐름에서 mealLogs를 logged로 저장한 뒤)
 * 열려 있는 끼니 잠금을 'action'으로 닫는다.
 */
export function releaseMealLock(now = new Date()) {
  finish('meal', 'action', now);
}

/**
 * 헬스 도착 확인. 'geofence'는 위치로 도착을 확인했을 때, 'photo'는 사진 인증을 마쳤을 때.
 * gym_logs에 남기고 헬스 잠금을 'action'으로 푼다.
 */
export function releaseGymLock(by: 'geofence' | 'photo', now = new Date()) {
  markGymDone(by, now);
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  getLockEngine()
    .markDone('gym', day)
    .catch(() => {}); // 앱이 꺼져 있어도 오늘 헬스는 다시 잠그지 않는다
  finish('gym', 'action', now);
}

/** 비상 해제 사유 최대 글자 수 (서버 lock_events.reason과 같다) */
export const EMERGENCY_REASON_MAX = 100;

/** 사유는 선택. 앞뒤 공백을 지우고 비었으면 null. */
export const cleanReason = (v: string | null | undefined): string | null => {
  const r = (v ?? '').trim().slice(0, EMERGENCY_REASON_MAX);
  return r === '' ? null : r;
};

/** 비상 해제. 5초 대기가 끝난 뒤 부른다. 사유는 이번에 닫는 잠금 기록에 남고 동기화된다. 남은 횟수가 없으면 false. */
export function emergencyRelease(type: LockType, now = new Date(), reason?: string | null): boolean {
  const s = useSettings.getState().settings;
  if (!s) return false;
  if (!getCouponPort().spend('emergency', s.emergencyPerWeek, now)) return false;
  finish(type, 'emergency', now, cleanReason(reason));
  return true;
}

/** 휴식권으로 헬스 잠금 풀기. 5초 대기가 끝난 뒤 부른다. 남은 장수가 없으면 false. */
export function spendRestCoupon(now = new Date()): boolean {
  const s = useSettings.getState().settings;
  if (!s) return false;
  if (!getCouponPort().spend('rest', s.coupons.rest, now)) return false;
  markGymDone('rest', now);
  finish('gym', 'coupon', now);
  return true;
}
