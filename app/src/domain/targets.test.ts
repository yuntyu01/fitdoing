import { MIN_KCAL, clampKcal, defaultTargets, macrosFor, perMealTarget } from './targets';

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
