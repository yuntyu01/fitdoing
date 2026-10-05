export type Goal = 'lose' | 'keep' | 'gain';

export interface Targets {
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
}

// 나이·성별을 받지 않아 기초대사량을 못 구하므로, 목표 칼로리의 바닥은 고정값으로 둔다.
export const MIN_KCAL = 1200;

const KCAL_PER_KG: Record<Goal, number> = { lose: 25, keep: 30, gain: 35 };
const PROTEIN_PER_KG: Record<Goal, number> = { lose: 2.0, keep: 1.6, gain: 1.8 };
const FAT_RATIO = 0.25;

export function clampKcal(kcal: number): number {
  return Math.max(MIN_KCAL, Math.round(kcal));
}

/** 목표·몸무게로 기본 목표를 잡는다. 설정에서 바꿀 수 있다. */
export function defaultTargets(goal: Goal, weightKg: number): Targets {
  const kcal = clampKcal(Math.round((weightKg * KCAL_PER_KG[goal]) / 50) * 50);
  return macrosFor(kcal, Math.round(weightKg * PROTEIN_PER_KG[goal]));
}

/** 칼로리와 단백질이 정해지면 지방은 25%, 탄수화물은 나머지로 채운다. */
export function macrosFor(kcal: number, protein: number): Targets {
  const fat = Math.round((kcal * FAT_RATIO) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, carbs, protein, fat };
}

/** 빈 끼니 칸에 연하게 보여줄 끼니당 목표 */
export function perMealTarget(t: Targets, mealCount: number): Targets {
  const n = Math.max(1, mealCount);
  return {
    kcal: Math.round(t.kcal / n),
    carbs: Math.round(t.carbs / n),
    protein: Math.round(t.protein / n),
    fat: Math.round(t.fat / n),
  };
}
