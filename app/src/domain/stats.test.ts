import { clampWeeklyTarget, gymWeek, ratio, streak, sumNutrition, weeklyTargetForDays } from './stats';

describe('streak', () => {
  const now = new Date(2026, 8, 26, 18, 0);

  it('오늘 포함 연속', () => {
    expect(streak(new Set(['2026-09-24', '2026-09-25', '2026-09-26']), now)).toBe(3);
  });

  it('오늘 아직 없으면 어제부터', () => {
    expect(streak(new Set(['2026-09-24', '2026-09-25']), now)).toBe(2);
  });

  it('중간에 빠지면 끊긴다', () => {
    expect(streak(new Set(['2026-09-23', '2026-09-25', '2026-09-26']), now)).toBe(2);
  });

  it('없으면 0', () => {
    expect(streak(new Set(), now)).toBe(0);
  });
});

describe('gymWeek', () => {
  it('이번 주 인증만 센다', () => {
    const now = new Date(2026, 8, 26); // 토
    const r = gymWeek(['2026-09-20', '2026-09-21', '2026-09-23', '2026-09-23'], 5, now);
    expect(r).toEqual({ done: 2, planned: 5 });
  });

  it('계획 횟수는 요일 수가 아니라 주간 목표', () => {
    const now = new Date(2026, 8, 26);
    expect(gymWeek(['2026-09-21'], 3, now)).toEqual({ done: 1, planned: 3 });
  });

  it('주간 목표가 범위를 벗어나면 1~7로 자른다', () => {
    const now = new Date(2026, 8, 26);
    expect(gymWeek([], 0, now).planned).toBe(1);
    expect(gymWeek([], 9, now).planned).toBe(7);
  });
});

describe('clampWeeklyTarget', () => {
  it('고른 요일 수 이하, 1 이상', () => {
    expect(clampWeeklyTarget(5, 3)).toBe(3);
    expect(clampWeeklyTarget(2, 5)).toBe(2);
    expect(clampWeeklyTarget(0, 5)).toBe(1);
    expect(clampWeeklyTarget(3, 0)).toBe(1);
    expect(clampWeeklyTarget(Number.NaN, 4)).toBe(4);
  });
});

describe('weeklyTargetForDays', () => {
  it('목표가 요일 수와 같았으면 요일을 더할 때 따라간다', () => {
    expect(weeklyTargetForDays(5, 5, 6)).toBe(6);
    expect(weeklyTargetForDays(0, 0, 1)).toBe(1);
  });

  it('목표가 요일 수보다 작았으면 요일을 더해도 그대로', () => {
    expect(weeklyTargetForDays(3, 5, 6)).toBe(3);
  });

  it('요일을 빼면 새 요일 수 안으로 줄인다', () => {
    expect(weeklyTargetForDays(5, 5, 4)).toBe(4);
    expect(weeklyTargetForDays(3, 5, 2)).toBe(2);
    expect(weeklyTargetForDays(2, 5, 4)).toBe(2);
  });
});

describe('sumNutrition', () => {
  it('나눠 먹었으면 절반으로 센다 (서버와 같은 규칙)', () => {
    const r = sumNutrition([{ ai: { kcal: 800, carbs: 100, protein: 40, fat: 20 }, portion: 1, sharedMeal: true }]);
    expect(r).toEqual({ kcal: 400, carbs: 50, protein: 20, fat: 10 });
  });

  it('portion을 곱해서 더하고 ai 없는 끼니는 건너뛴다', () => {
    const r = sumNutrition([
      { ai: { kcal: 400, carbs: 40, protein: 30, fat: 10 }, portion: 1 },
      { ai: { kcal: 600, carbs: 60, protein: 20, fat: 20 }, portion: 0.5 },
      { ai: null, portion: 1 },
    ]);
    expect(r).toEqual({ kcal: 700, carbs: 70, protein: 40, fat: 20 });
  });
});

describe('ratio', () => {
  it('0~1로 자른다', () => {
    expect(ratio(1160, 1600)).toBeCloseTo(0.725);
    expect(ratio(2000, 1600)).toBe(1);
    expect(ratio(10, 0)).toBe(0);
  });
});
