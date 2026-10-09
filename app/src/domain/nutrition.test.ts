import {
  AMDR,
  autoBlocks,
  calculate,
  cleanAllergies,
  defaultNutrition,
  eer,
  fastingConflicts,
  outsideAmdr,
  splitTraining,
  toTargets,
  type BodyInput,
  type CalcInput,
  type Plan,
} from './nutrition';

// 기대값은 구현과 따로 계산했다(파이썬 Fraction 으로 식을 그대로 계산, 2025 KDRI 1권 계산 예시와 대조).

const man: BodyInput = { sex: 'male', age: 40, heightCm: 172, weightKg: 70, activity: 'low' };
const woman: BodyInput = { sex: 'female', age: 28, heightCm: 162, weightKg: 55, activity: 'low' };
const none = { pregnant: false, lactating: false, medicalDiet: false };

const input = (
  plan: Plan,
  body: BodyInput = man,
  goal: CalcInput['goal'] = 'keep',
  adj: number | null = null,
): CalcInput => ({
  goal,
  body,
  nutrition: { goalAdjustPct: adj, plan, eligibility: none },
});
const ok = (r: ReturnType<typeof calculate>) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.calc;
};
const full = (b: BodyInput) => b as Parameters<typeof eer>[0];

describe('eer: 2025 KDRI 성인 식', () => {
  it('KDRI 1권 계산 예시: 남 19-29세 24세 69.1kg 1.748m 저활동 = 2,701', () => {
    expect(Math.round(eer({ sex: 'male', age: 24, heightCm: 174.8, weightKg: 69.1, activity: 'low' }))).toBe(2701);
  });
  it('KDRI 1권 계산 예시: 여 19-29세 24세 55.9kg 1.615m 저활동 = 2,087', () => {
    expect(Math.round(eer({ sex: 'female', age: 24, heightCm: 161.5, weightKg: 55.9, activity: 'low' }))).toBe(2087);
  });

  it.each([
    ['sedentary', 2322.612],
    ['low', 2547.21132],
    ['active', 2833.065],
    ['veryActive', 3302.68176],
  ] as const)('남성 40세 172cm 70kg %s', (activity, want) => {
    expect(eer(full({ ...man, activity }))).toBeCloseTo(want, 6);
  });

  it.each([
    ['sedentary', 1851.44],
    ['low', 2054.3504],
    ['active', 2307.9884],
    ['veryActive', 2612.354],
  ] as const)('여성 28세 162cm 55kg %s', (activity, want) => {
    expect(eer(full({ ...woman, activity }))).toBeCloseTo(want, 6);
  });

  it('키는 cm 로 받아 m 로 바꾼다 · 소수 체중', () => {
    expect(eer(full({ ...man, weightKg: 70.5 }))).toBeCloseTo(2556.04137, 6);
    expect(eer({ sex: 'female', age: 33, heightCm: 158.5, weightKg: 52.3, activity: 'active' })).toBeCloseTo(
      2209.07226,
      6,
    );
  });
});

describe('autoBlocks: 일반 자동 계산 대상', () => {
  it('미입력은 계산하지 않는다', () => {
    expect(autoBlocks({ sex: null, age: null, heightCm: 170, weightKg: 60, activity: null }, none)).toEqual([
      'missingSex',
      'missingAge',
      'missingActivity',
    ]);
  });
  it('미성년자·임신·수유·질환 식단', () => {
    expect(autoBlocks({ ...man, age: 17 }, none)).toEqual(['minor']);
    expect(autoBlocks(man, { ...none, pregnant: true })).toEqual(['special']);
    expect(autoBlocks(man, { ...none, lactating: true })).toEqual(['special']);
    expect(autoBlocks(man, { ...none, medicalDiet: true })).toEqual(['special']);
  });
  it('막히면 균형·운동 모드는 결과를 내지 않는다', () => {
    const r = calculate({ ...input(defaultNutrition('keep').plan), body: { ...man, age: null } });
    expect(r).toMatchObject({ ok: false, error: 'autoBlocked' });
  });
});

describe('목표 칼로리: 조정 후 50kcal 반올림 한 번', () => {
  it.each([
    ['lose', 2037.769056, 2050],
    ['keep', 2547.21132, 2550],
    ['gain', 2801.932452, 2800],
    ['bulk', 3056.653584, 3050],
  ] as const)('%s', (goal, adjusted, kcal) => {
    const c = ok(calculate(input(defaultNutrition(goal).plan, man, goal)));
    expect(c.maintenance).toBeCloseTo(2547.21132, 6);
    expect(c.adjusted).toBeCloseTo(adjusted, 6);
    expect(c.kcal).toBe(kcal);
  });

  it('조정률은 바꿀 수 있다(앱 정책)', () => {
    expect(ok(calculate(input(defaultNutrition('lose').plan, man, 'lose', -10))).kcal).toBe(2300); // 2292.49 → 2300
  });

  it('1200kcal 아래면 조용히 올리지 않고 오류', () => {
    const small: BodyInput = { sex: 'female', age: 80, heightCm: 145, weightKg: 35, activity: 'sedentary' };
    expect(calculate(input(defaultNutrition('lose').plan, small, 'lose'))).toMatchObject({
      ok: false,
      error: 'belowMin',
    });
  });
});

describe('일반 균형', () => {
  it('시작 비율 55/20/25 은 칼로리 비율', () => {
    const c = ok(calculate(input({ mode: 'balanced', ratio: [55, 20, 25], carb: { kind: 'none' } })));
    expect(c.kcal).toBe(2550);
    expect(c.carbs).toBeCloseTo(350.625, 9);
    expect(c.protein).toBeCloseTo(127.5, 9);
    expect(c.fat).toBeCloseTo(70.833333, 5);
    expect(c.percent[0]).toBeCloseTo(55, 9);
  });
  it('합계가 100이 아니면 오류', () => {
    expect(calculate(input({ mode: 'balanced', ratio: [55, 20, 20], carb: { kind: 'none' } }))).toMatchObject({
      ok: false,
      error: 'ratioSum',
    });
  });
  it('저탄수 40%: 탄수·단백질 고정, 남은 칼로리는 지방', () => {
    const c = ok(
      calculate(input({ mode: 'balanced', ratio: [55, 20, 25], carb: { kind: 'lowCarb', by: 'pct', value: 40 } })),
    );
    expect(c.carbs).toBeCloseTo(255, 9);
    expect(c.protein).toBeCloseTo(127.5, 9);
    expect(c.fat).toBeCloseTo(113.333333, 5);
  });
});

describe('운동 중심', () => {
  it('예시: 2,000kcal 70kg 1.8g/kg 지방 25% → 탄 249 / 단 126 / 지 55.56', () => {
    const g = splitTraining(2000, 70, 1.8, 25, null);
    expect(g.protein).toBeCloseTo(126, 9);
    expect(g.fat).toBeCloseTo(55.555556, 5);
    expect(g.carbs).toBeCloseTo(249, 9);
  });

  it('유지 2,550kcal 1.6g/kg: 단 112 / 지 70.83 / 탄 366.125 · g/kg 표시', () => {
    const c = ok(calculate(input({ mode: 'training', proteinPerKg: 1.6, fatPct: 25, carb: { kind: 'none' } })));
    expect(c.protein).toBeCloseTo(112, 9);
    expect(c.fat).toBeCloseTo(70.833333, 5);
    expect(c.carbs).toBeCloseTo(366.125, 9);
    expect(c.proteinPerKg).toBeCloseTo(1.6, 9);
  });

  it('잔여 칼로리가 음수면 0으로 바꾸지 않고 오류', () => {
    const r = calculate(input({ mode: 'training', proteinPerKg: 6, fatPct: 40, carb: { kind: 'none' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('negativeRemainder');
      expect(r.calc.carbs!).toBeLessThan(0);
    }
  });

  it('케토 50g(총탄수) + 감량: 남은 칼로리는 지방', () => {
    const c = ok(
      calculate(
        input(
          { mode: 'training', proteinPerKg: 2.0, fatPct: 25, carb: { kind: 'keto', by: 'grams', value: 50 } },
          man,
          'lose',
        ),
      ),
    );
    expect(c.kcal).toBe(2050);
    expect(c.carbs).toBe(50);
    expect(c.protein).toBeCloseTo(140, 9);
    expect(c.fat).toBeCloseTo(143.333333, 5);
    expect(c.percent[2]).toBeCloseTo(62.926829, 5);
  });

  it('탄수 g 이 총열량보다 크면 오류', () => {
    expect(
      calculate(
        input({ mode: 'training', proteinPerKg: 1.6, fatPct: 25, carb: { kind: 'lowCarb', by: 'grams', value: 700 } }),
      ),
    ).toMatchObject({ ok: false, error: 'carbOverKcal' });
  });
});

describe('직접 설정', () => {
  const blocked: BodyInput = { sex: null, age: null, heightCm: 170, weightKg: 70, activity: null };

  it('예시: 2,000kcal 5:3:2 → 탄 250 / 단 150 / 지 44.44 (신체 정보 없이도)', () => {
    const c = ok(
      calculate(input({ mode: 'custom', custom: { kind: 'ratio', kcal: 2000, ratio: [50, 30, 20] } }, blocked)),
    );
    expect(c.maintenance).toBeNull();
    expect(c.carbs).toBeCloseTo(250, 9);
    expect(c.protein).toBeCloseTo(150, 9);
    expect(c.fat).toBeCloseTo(44.444444, 5);
    expect(toTargets(c)).toEqual({ kcal: 2000, carbs: 250, protein: 150, fat: 44 });
  });

  it('kcal + 2개 고정 → 나머지 계산', () => {
    const c = ok(
      calculate(
        input({
          mode: 'custom',
          custom: { kind: 'fixKcal', kcal: 2000, solve: 'fat', grams: { carbs: 200, protein: 150, fat: 999 } },
        }),
      ),
    );
    expect(c.fat).toBeCloseTo(66.666667, 5); // 고정하지 않은 칸의 예전 값(999)은 쓰지 않는다
    expect(c.kcal).toBe(2000);
  });

  it('kcal + 2개 고정에서 남는 칼로리가 음수면 오류', () => {
    expect(
      calculate(
        input({
          mode: 'custom',
          custom: { kind: 'fixKcal', kcal: 1500, solve: 'carbs', grams: { carbs: 0, protein: 200, fat: 100 } },
        }),
      ),
    ).toMatchObject({ ok: false, error: 'negativeRemainder' });
  });

  it('탄단지 g 3개 → 총 kcal (kcal 은 따로 고정하지 않는다)', () => {
    const c = ok(
      calculate(input({ mode: 'custom', custom: { kind: 'grams', grams: { carbs: 180, protein: 120, fat: 60 } } })),
    );
    expect(c.kcal).toBe(1740);
  });

  it('비율 합계 100 확인', () => {
    expect(
      calculate(input({ mode: 'custom', custom: { kind: 'ratio', kcal: 2000, ratio: [50, 30, 30] } })),
    ).toMatchObject({ ok: false, error: 'ratioSum' });
  });
});

describe('AMDR 2025 참고 범위', () => {
  it('성인 탄 50–65 / 단 10–20 / 지 15–30', () => {
    expect(AMDR).toEqual({ carbs: [50, 65], protein: [10, 20], fat: [15, 30] });
  });
  it('5:3:2 는 단백질이 범위 밖(안내만)', () => {
    expect(outsideAmdr([50, 30, 20])).toEqual(['protein']);
    expect(outsideAmdr([55, 20, 25])).toEqual([]);
  });
});

describe('음식 선택·단식 구조', () => {
  it('알레르기는 정리해서 따로 저장', () => {
    expect(cleanAllergies([' 땅콩 ', '', '땅콩', '새우'])).toEqual(['땅콩', '새우']);
  });
  it('먹는 시간 밖의 끼니 마감을 찾는다(자정 넘김 포함)', () => {
    const meals = [
      { index: 1, deadline: '08:00' },
      { index: 2, deadline: '13:00' },
      { index: 3, deadline: '19:00' },
    ];
    expect(fastingConflicts(meals, null)).toEqual([]);
    expect(fastingConflicts(meals, { eatFrom: '12:00', eatTo: '20:00' })).toEqual([1]);
    expect(fastingConflicts(meals, { eatFrom: '18:00', eatTo: '09:00' })).toEqual([2]);
  });
});
