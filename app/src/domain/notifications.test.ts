import { mealKey, planNotifications } from './notifications';

const input = {
  meals: [
    { index: 1, deadline: '08:00' },
    { index: 2, deadline: '14:00' },
  ],
  gym: { enabled: true, days: [5], arriveBy: '19:00' }, // 토
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
