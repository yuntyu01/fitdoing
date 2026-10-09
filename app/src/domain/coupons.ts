import { addDays, parseDateKey, weekKey } from './time';

export type CouponType = 'rest' | 'cheat';

export interface CouponUseRow {
  type: 'rest' | 'cheat' | 'emergency';
  usedAt: number;
  weekKey: string;
}

export interface CouponStatus {
  rest: { total: number; used: number; left: number };
  cheat: { total: number; used: number; left: number };
  /** 이번 주 사용 내역 (휴식·치팅만, 오래된 순) */
  uses: { type: CouponType; usedAt: number }[];
  /** 이번 주 월요일 / 다음 초기화(다음 월요일) */
  weekKey: string;
  resetOn: string;
}

function slot(total: number, used: number) {
  const t = Math.max(0, total);
  return { total: t, used, left: Math.max(0, t - used) };
}

/** 쿠폰은 매주 월요일 0시에 초기화된다. 주 키(월요일 날짜)가 같은 사용만 센다. */
export function couponStatus(total: { rest: number; cheat: number }, uses: CouponUseRow[], now: Date): CouponStatus {
  const wk = weekKey(now);
  const mine = uses
    .filter((u): u is CouponUseRow & { type: CouponType } => u.weekKey === wk && u.type !== 'emergency')
    .sort((a, b) => a.usedAt - b.usedAt);
  return {
    rest: slot(total.rest, mine.filter((u) => u.type === 'rest').length),
    cheat: slot(total.cheat, mine.filter((u) => u.type === 'cheat').length),
    uses: mine.map(({ type, usedAt }) => ({ type, usedAt })),
    weekKey: wk,
    resetOn: weekKey(addDays(parseDateKey(wk), 7)),
  };
}

export function canUse(status: CouponStatus, type: CouponType): boolean {
  return status[type].left > 0;
}

/** 쿠폰 시트에서 지금 쓸 수 없는 이유. 쓸 수 있으면 null. */
export type CouponBlock = 'gymOff' | 'gymDone' | 'noneLeft' | 'spicyOnly';

/**
 * 쿠폰 시트의 "쿠폰 사용하기" 조건. 새 규칙을 만들지 않고 이미 쓰는 곳의 조건을 그대로 옮긴다.
 * - 휴식권: 헬스 상세 "오늘 쉬기"와 같다. 헬스 계획이 켜져 있고(그래야 그 화면이 열린다) 오늘 인증 전이며 남은 장수가 있을 때.
 * - 치팅: 앱에 쓰는 곳이 없다(매운맛 전용, 아직 닫혀 있음). 항상 막는다.
 */
export function couponBlock(
  type: CouponType,
  status: CouponStatus,
  gym: { enabled: boolean; doneToday: boolean },
): CouponBlock | null {
  if (type === 'cheat') return 'spicyOnly';
  if (!gym.enabled) return 'gymOff';
  if (gym.doneToday) return 'gymDone';
  if (!canUse(status, 'rest')) return 'noneLeft';
  return null;
}
