/**
 * 쿠폰 (로컬 SQLite coupon_uses + settings.coupons). 서버 호출 없음.
 *
 * 잠금 화면 쪽에서 쓰는 API
 *
 *   useCouponStatus(): CouponStatus
 *     이번 주(월요일 키) 남은 장수와 사용 내역. couponUses가 바뀌면 자동 갱신.
 *     status.rest.left / status.rest.total, status.cheat.left, status.uses, status.resetOn
 *
 *   useRestCoupon(): {
 *     status: CouponStatus;
 *     canUse: boolean;            // 휴식권이 남아 있고 대기 중이 아닐 때
 *     secondsLeft: number | null; // 대기 중이면 5,4,3,2,1 / 아니면 null
 *     start(): void;              // 5초 대기 시작. 끝나면 자동 확정
 *     cancel(): void;             // 대기 중 취소 (쓰지 않은 것으로 남는다)
 *     confirmed: boolean;         // 확정되어 쿠폰이 차감됐다
 *   }
 *   확정 때 하는 일: coupon_uses에 rest 한 줄, 오늘 gym_logs를 verifiedBy='rest'로 기록,
 *   열려 있는 gym 잠금 이벤트를 releasedBy='coupon'으로 닫는다.
 *   (실제 네이티브 잠금 해제는 호출한 쪽이 confirmed를 보고 처리한다.)
 *
 *   confirmRestCoupon(now?: Date): boolean   // 훅 없이 바로 확정. 남은 장수가 없으면 false
 *
 *   useGymDoneToday(): boolean   // 오늘 헬스 인증(휴식권 포함)을 마쳤는지. 쿠폰 시트가 휴식권 조건에 쓴다.
 */
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { db } from '../../db/client';
import { couponUses, gymLogs, lockEvents, settings as settingsTable } from '../../db/schema';
import { canUse, couponStatus, type CouponStatus } from '../../domain/coupons';
import { dateKey, weekKey } from '../../domain/time';
import { trackCoupon, trackGym, trackLock } from '../api/track';
import { useSettingsValue } from '../settings/store';

export const REST_WAIT_SECONDS = 5;

export function useCouponStatus(now: Date = new Date()): CouponStatus {
  const s = useSettingsValue();
  const { data } = useLiveQuery(db.select().from(couponUses));
  const wk = weekKey(now);
  return useMemo(() => couponStatus(s.coupons, data, now), [s.coupons, data, wk]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** 오늘 헬스를 인증(위치·사진·휴식권)했는지. 헬스 상세의 doneToday와 같은 기준이다. */
export function useGymDoneToday(now: Date = new Date()): boolean {
  const today = dateKey(now);
  const { data } = useLiveQuery(
    db
      .select({ date: gymLogs.date })
      .from(gymLogs)
      .where(and(eq(gymLogs.date, today), isNotNull(gymLogs.verifiedBy))),
    [today],
  );
  return data.some((r) => r.date === today);
}

export function confirmRestCoupon(now: Date = new Date(), total?: { rest: number; cheat: number }): boolean {
  const coupons = total ?? db.select().from(settingsTable).get()?.json.coupons ?? { rest: 0, cheat: 0 };
  const status = couponStatus(coupons, db.select().from(couponUses).all(), now);
  if (!canUse(status, 'rest')) return false;
  const ts = now.getTime();
  const today = dateKey(now);
  const openGym = db
    .select({ startedAt: lockEvents.startedAt })
    .from(lockEvents)
    .where(and(eq(lockEvents.type, 'gym'), isNull(lockEvents.endedAt)))
    .all();
  db.transaction((tx) => {
    tx.insert(couponUses)
      .values({ type: 'rest', usedAt: ts, weekKey: weekKey(now) })
      .run();
    tx.insert(gymLogs)
      .values({ date: today, verifiedBy: 'rest' })
      .onConflictDoUpdate({ target: gymLogs.date, set: { verifiedBy: 'rest' } })
      .run();
    tx.update(lockEvents)
      .set({ endedAt: ts, releasedBy: 'coupon' })
      .where(and(eq(lockEvents.type, 'gym'), isNull(lockEvents.endedAt)))
      .run();
  });
  trackCoupon('rest', ts);
  trackGym(today);
  for (const e of openGym) trackLock('gym', e.startedAt);
  return true;
}

export function useRestCoupon() {
  const settings = useSettingsValue();
  const status = useCouponStatus();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const coupons = useRef(settings.coupons);
  useEffect(() => {
    coupons.current = settings.coupons;
  }, [settings.coupons]);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const cancel = useCallback(() => {
    stop();
    setSecondsLeft(null);
  }, [stop]);

  const start = useCallback(() => {
    if (timer.current) return;
    let left = REST_WAIT_SECONDS;
    setSecondsLeft(left);
    timer.current = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setSecondsLeft(left);
        return;
      }
      stop();
      setSecondsLeft(null);
      setConfirmed(confirmRestCoupon(new Date(), coupons.current));
    }, 1000);
  }, [stop]);

  return {
    status,
    canUse: canUse(status, 'rest') && secondsLeft === null && !confirmed,
    secondsLeft,
    start,
    cancel,
    confirmed,
  };
}
