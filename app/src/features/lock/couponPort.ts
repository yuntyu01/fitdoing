import { db } from '../../db/client';
import { couponUses } from '../../db/schema';
import { couponStatus } from '../../domain/coupons';
import { weekKey } from '../../domain/time';
import { trackCoupon } from '../api/track';

// 잠금 쪽에서 쓰는 쿠폰 최소 인터페이스.
// 휴식권 남은 장수는 domain/coupons.ts의 couponStatus를 쓰고, 비상 해제는 같은 표(coupon_uses)를 주 단위로 센다.
// 다른 구현이 필요하면 setCouponPort()로 갈아 끼운다.

export type SpendKind = 'rest' | 'emergency';

export interface CouponPort {
  /** 이번 주(월요일 초기화) 남은 횟수. perWeek는 설정에서 온 주당 장수 */
  remaining(kind: SpendKind, perWeek: number, now: Date): number;
  /** 한 장 쓴다. 남은 게 없으면 false */
  spend(kind: SpendKind, perWeek: number, now: Date): boolean;
}

export const dbCouponPort: CouponPort = {
  remaining(kind, perWeek, now) {
    const uses = db.select().from(couponUses).all();
    if (kind === 'rest') return couponStatus({ rest: perWeek, cheat: 0 }, uses, now).rest.left;
    const used = uses.filter((u) => u.type === kind && u.weekKey === weekKey(now)).length;
    return Math.max(0, perWeek - used);
  },
  spend(kind, perWeek, now) {
    if (this.remaining(kind, perWeek, now) <= 0) return false;
    db.insert(couponUses).values({ type: kind, usedAt: now.getTime(), weekKey: weekKey(now) }).run();
    trackCoupon(kind, now.getTime());
    return true;
  },
};

let port: CouponPort = dbCouponPort;

export const getCouponPort = () => port;
export const setCouponPort = (p: CouponPort) => {
  port = p;
};
