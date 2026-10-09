import { MIN_KCAL, clampKcal, defaultTargets, macrosFor, perMealTarget, remainingPerMeal } from './targets';

describe('defaultTargets', () => {
  it('70kg 유지', () => {
    expect(defaultTargets('keep', 70)).toEqual({ kcal: 2100, protein: 112, fat: 58, carbs: 283 });
  });

  it('감량은 더 적게, 단백질은 더 많이', () => {
    const lose = defaultTargets('lose', 70);
    expect(lose.kcal).toBe(1750);
    expect(lose.protein).toBe(140);
  });

  it('바닥 아래로 내려가지 않는다', () => {
    expect(defaultTargets('lose', 40).kcal).toBe(MIN_KCAL);
    expect(clampKcal(800)).toBe(MIN_KCAL);
  });
});

describe('macrosFor', () => {
  it('탄수화물은 음수가 되지 않는다', () => {
    expect(macrosFor(1200, 400).carbs).toBe(0);
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
    expect(remainingPerMeal(t, { kcal: 400, carbs: 45, protein: 25, fat: 13 }, 3)).toEqual({ kcal: 400, carbs: 45, protein: 25, fat: 13 });
    // 시안: 3끼 먹고 1끼 남음 → 남은 그대로
    expect(remainingPerMeal(t, { kcal: 1160, carbs: 123, protein: 73, fat: 42 }, 1)).toEqual({ kcal: 440, carbs: 57, protein: 27, fat: 11 });
  });
  it('이미 넘쳤으면 0', () => {
    expect(remainingPerMeal(t, { kcal: 2000, carbs: 200, protein: 120, fat: 60 }, 2)).toEqual({ kcal: 0, carbs: 0, protein: 0, fat: 0 });
  });
});
