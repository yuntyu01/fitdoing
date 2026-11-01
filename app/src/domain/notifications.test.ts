import { mealKey, notificationRoute, planNotifications } from './notifications';

const input = {
  meals: [
    { index: 1, deadline: '08:00' },
    { index: 2, deadline: '14:00' },
  ],
  gym: { enabled: true, days: [5], arriveBy: '19:00' }, // 토
  sleep: { enabled: false, bedTime: '23:30' },
};

describe('planNotifications', () => {
  const now = new Date(2026, 8, 26, 9, 0); // 토 09:00

  it('지난 알림은 빼고 시간순', () => {
    const r = planNotifications(input, now, new Set(), 1);
    expect(r.map((n) => n.id)).toEqual(['meal-pre-2026-09-26-2', 'meal-due-2026-09-26-2', 'gym-2026-09-26']);
    expect(r[0].at.getHours()).toBe(13);
    expect(r[0].at.getMinutes()).toBe(30);
    expect(r[2].at.getHours()).toBe(18);
  });

  it('찍은 끼니는 뺀다', () => {
    const r = planNotifications(input, now, new Set([mealKey('2026-09-26', 2)]), 1);
    expect(r.map((n) => n.kind)).toEqual(['gym_start']);
  });

  it('헬스를 끄면 헬스 알림 없음', () => {
    const r = planNotifications({ ...input, gym: { ...input.gym, enabled: false } }, now, new Set(), 1);
    expect(r.some((n) => n.kind === 'gym_start')).toBe(false);
  });

  it('여러 날 펼치고, 헬스는 계획한 요일에만', () => {
    const r = planNotifications(input, now, new Set(), 7);
    expect(r.filter((n) => n.kind === 'meal_due')).toHaveLength(1 + 6 * 2);
    expect(r.filter((n) => n.kind === 'gym_start')).toHaveLength(1);
  });
});

describe('취침 알림', () => {
  const now = new Date(2026, 8, 26, 22, 0); // 토 22:00

  it('켜 두면 취침 시각에 온다', () => {
    const r = planNotifications({ ...input, sleep: { enabled: true, bedTime: '23:30' } }, now, new Set(), 1);
    const sleep = r.find((n) => n.kind === 'sleep_start');
    expect(sleep?.at.getHours()).toBe(23);
    expect(sleep?.at.getMinutes()).toBe(30);
  });

  it('끄면 없다', () => {
    expect(planNotifications(input, now, new Set(), 1).some((n) => n.kind === 'sleep_start')).toBe(false);
  });
});

describe('notificationRoute', () => {
  it('끼니 알림은 촬영, 헬스 알림은 헬스 상세로', () => {
    expect(notificationRoute('meal_pre')).toBe('/capture');
    expect(notificationRoute('meal_due')).toBe('/capture');
    expect(notificationRoute('gym_start')).toBe('/gym');
  });

  it('취침이나 모르는 알림은 앱만 연다', () => {
    expect(notificationRoute('sleep_start')).toBeNull();
    expect(notificationRoute(undefined)).toBeNull();
  });
});
