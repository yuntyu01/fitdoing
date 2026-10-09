import { HISTORY_START, perMealTarget, recordTargets, remainingPerMeal, targetsOn, type TargetEntry } from './targets';

const A = { kcal: 2100, carbs: 283, protein: 112, fat: 58 };
const B = { kcal: 2550, carbs: 351, protein: 128, fat: 71 };
const C = { kcal: 2000, carbs: 250, protein: 150, fat: 44 };

describe('날짜별 목표', () => {
  it('처음 바꾸면 예전 목표를 시작 날짜부터로 남긴다', () => {
    const h = recordTargets([], A, B, '2026-10-08');
    expect(h).toEqual([
      { from: HISTORY_START, ...A },
      { from: '2026-10-08', ...B },
    ]);
    expect(targetsOn(h, B, '2026-10-06')).toEqual(A); // 지난 월요일은 예전 목표 그대로
    expect(targetsOn(h, B, '2026-10-08')).toEqual(B);
    expect(targetsOn(h, B, '2026-10-12')).toEqual(B);
  });

  it('같은 날 다시 바꾸면 그날 항목만 덮는다', () => {
    let h: TargetEntry[] = recordTargets([], A, B, '2026-10-08');
    h = recordTargets(h, B, C, '2026-10-08');
    expect(h.map((e) => e.from)).toEqual([HISTORY_START, '2026-10-08']);
    expect(targetsOn(h, C, '2026-10-08')).toEqual(C);
    expect(targetsOn(h, C, '2026-10-07')).toEqual(A);
  });

  it('같은 목표면 이력을 늘리지 않는다', () => {
    expect(recordTargets([], A, { ...A }, '2026-10-08')).toEqual([]);
  });

  it('이력이 없으면 현재 목표', () => {
    expect(targetsOn([], A, '2020-01-01')).toEqual(A);
  });
});

describe('perMealTarget', () => {
  it('끼니 수로 나눈다', () => {
    expect(perMealTarget({ kcal: 1600, carbs: 180, protein: 100, fat: 53 }, 4)).toEqual({
      kcal: 400,
      carbs: 45,
      protein: 25,
      fat: 13,
    });
  });
});

describe('remainingPerMeal', () => {
  const t = { kcal: 1600, carbs: 180, protein: 100, fat: 53 };
  it('남은 양을 남은 끼니 수로 똑같이 나눈다', () => {
    // 1끼만 먹음(400) → 남은 1200을 3끼가 400씩
    expect(remainingPerMeal(t, { kcal: 400, carbs: 45, protein: 25, fat: 13 }, 3)).toEqual({
      kcal: 400,
      carbs: 45,
      protein: 25,
      fat: 13,
    });
    // 시안: 3끼 먹고 1끼 남음 → 남은 그대로
    expect(remainingPerMeal(t, { kcal: 1160, carbs: 123, protein: 73, fat: 42 }, 1)).toEqual({
      kcal: 440,
      carbs: 57,
      protein: 27,
      fat: 11,
    });
  });
  it('이미 넘쳤으면 0', () => {
    expect(remainingPerMeal(t, { kcal: 2000, carbs: 200, protein: 120, fat: 60 }, 2)).toEqual({
      kcal: 0,
      carbs: 0,
      protein: 0,
      fat: 0,
    });
  });
});
