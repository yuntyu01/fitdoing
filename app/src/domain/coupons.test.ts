import { canUse, couponBlock, couponStatus } from './coupons';
import { distanceMeters, formatDistance } from './geo';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('쿠폰 계산', () => {
  const total = { rest: 2, cheat: 2 };
  // 2026-10-05는 월요일
  const uses = [
    { type: 'rest' as const, usedAt: at(2026, 10, 5), weekKey: '2026-10-05' },
    { type: 'cheat' as const, usedAt: at(2026, 10, 7), weekKey: '2026-10-05' },
    { type: 'rest' as const, usedAt: at(2026, 10, 4), weekKey: '2026-09-28' }, // 지난 주
    { type: 'emergency' as const, usedAt: at(2026, 10, 6), weekKey: '2026-10-05' },
  ];

  it('이번 주 사용분만 센다 (비상 해제 제외)', () => {
    const s = couponStatus(total, uses, new Date(2026, 9, 8));
    expect(s.rest).toEqual({ total: 2, used: 1, left: 1 });
    expect(s.cheat).toEqual({ total: 2, used: 1, left: 1 });
    expect(s.uses.map((u) => u.type)).toEqual(['rest', 'cheat']);
    expect(s.resetOn).toBe('2026-10-12');
  });
  it('일요일 밤까지는 이번 주, 월요일 0시에 초기화', () => {
    const sun = couponStatus(total, uses, new Date(2026, 9, 11, 23, 59));
    expect(sun.rest.left).toBe(1);
    const mon = couponStatus(total, uses, new Date(2026, 9, 12, 0, 0));
    expect(mon.rest).toEqual({ total: 2, used: 0, left: 2 });
    expect(mon.uses).toHaveLength(0);
    expect(mon.weekKey).toBe('2026-10-12');
  });
  it('남은 장수가 0이면 못 쓴다, 설정을 줄여도 음수가 되지 않는다', () => {
    const s = couponStatus({ rest: 1, cheat: 0 }, uses, new Date(2026, 9, 8));
    expect(canUse(s, 'rest')).toBe(false);
    expect(s.cheat.left).toBe(0);
    expect(canUse(couponStatus(total, [], new Date(2026, 9, 8)), 'rest')).toBe(true);
  });
});

describe('거리', () => {
  it('같은 점 0, 위도 0.01도는 약 1.1km', () => {
    expect(distanceMeters({ lat: 37, lng: 127 }, { lat: 37, lng: 127 })).toBe(0);
    const d = distanceMeters({ lat: 37, lng: 127 }, { lat: 37.01, lng: 127 });
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1120);
  });
  it('표시', () => {
    expect(formatDistance(432)).toEqual({ value: '430', unit: 'm' });
    expect(formatDistance(1234)).toEqual({ value: '1.2', unit: 'km' });
  });
});

describe('쿠폰 시트에서 쓸 수 있는지', () => {
  const now = new Date(2026, 9, 8);
  const fresh = couponStatus({ rest: 2, cheat: 2 }, [], now);
  const gymOn = { enabled: true, doneToday: false };

  it('휴식권: 헬스를 켜 두고 오늘 인증 전이면 쓸 수 있다 (헬스 상세 "오늘 쉬기"와 같은 조건)', () => {
    expect(couponBlock('rest', fresh, gymOn)).toBeNull();
  });
  it('휴식권: 헬스 계획이 꺼져 있으면 못 쓴다', () => {
    expect(couponBlock('rest', fresh, { enabled: false, doneToday: false })).toBe('gymOff');
  });
  it('휴식권: 오늘 이미 인증(또는 휴식권 사용)했으면 못 쓴다', () => {
    expect(couponBlock('rest', fresh, { enabled: true, doneToday: true })).toBe('gymDone');
  });
  it('휴식권: 이번 주 장수를 다 썼으면 못 쓴다', () => {
    const used = [
      { type: 'rest' as const, usedAt: at(2026, 10, 5), weekKey: '2026-10-05' },
      { type: 'rest' as const, usedAt: at(2026, 10, 6), weekKey: '2026-10-05' },
    ];
    expect(couponBlock('rest', couponStatus({ rest: 2, cheat: 2 }, used, now), gymOn)).toBe('noneLeft');
  });
  it('치팅: 쓰는 곳이 없어서 항상 막힌다', () => {
    expect(couponBlock('cheat', fresh, gymOn)).toBe('spicyOnly');
  });
});
