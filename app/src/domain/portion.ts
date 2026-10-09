import type { AiResult, FoodItem } from '../db/schema';
import { eatenFactor, type Nutrition } from './stats';

// 음식별 먹은 양 (예: 밥 75%, 닭가슴살 100%).
// - 모든 음식에 칼로리·탄단지가 있으면(AI가 음식마다 추정) 끼니 합계 = 먹은 음식들의 합, 끼니 먹은 양은 1로 둔다.
// - 하나라도 숫자가 없으면(직접 추가·바코드·인식 실패) 음식별로는 계산할 수 없어서 예전처럼 끼니 전체 먹은 양을 쓴다.
// - 사용자가 합계를 직접 고쳤으면 그 값을 그대로 쓰고, 음식별 숫자는 참고로만 남는다(끼니 전체 먹은 양).
// 음식별 kcal·탄단지는 언제나 음식 전체 기준이고, portion은 그중 먹은 비율이다(null = 1).

const KEYS = ['kcal', 'carbs', 'protein', 'fat'] as const;

/** 이 음식을 먹은 비율 (없으면 전부 = 1) */
export function itemPortion(item: Pick<FoodItem, 'portion'>): number {
  return typeof item.portion === 'number' && item.portion > 0 ? item.portion : 1;
}

/** 음식별 칼로리·탄단지가 모두 있는가 (AI가 음식마다 추정한 음식) */
export function hasFoodNumbers(item: FoodItem): boolean {
  return KEYS.every((k) => typeof item[k] === 'number' && Number.isFinite(item[k]));
}

/** 음식이 하나 이상이고 모두 숫자가 있으면 음식별 먹은 양으로 합계를 낼 수 있다. */
export function canPortionPerFood(items: FoodItem[]): boolean {
  return items.length > 0 && items.every(hasFoodNumbers);
}

/** 음식 하나를 먹은 만큼 (음식 숫자 × 먹은 비율, 반올림 전). 숫자가 없는 칸은 0. */
export function eatenFood(item: FoodItem): Nutrition {
  const f = itemPortion(item);
  return {
    kcal: (item.kcal ?? 0) * f,
    carbs: (item.carbs ?? 0) * f,
    protein: (item.protein ?? 0) * f,
    fat: (item.fat ?? 0) * f,
  };
}

/** 먹은 음식들의 합. 서버가 정수만 받으므로 sanitizeAi처럼 0 이상 정수로 반올림한다. */
export function sumEatenFoods(items: FoodItem[]): Nutrition {
  const sum = { kcal: 0, carbs: 0, protein: 0, fat: 0 };
  for (const it of items) {
    const n = eatenFood(it);
    for (const k of KEYS) sum[k] += n[k];
  }
  for (const k of KEYS) sum[k] = Math.max(0, Math.round(sum[k]));
  return sum;
}

/** 모든 음식에 숫자가 있으면 합계를 음식별 먹은 양으로 다시 낸 AiResult. 아니면 그대로. */
export function withFoodPortions(ai: AiResult): AiResult {
  if (!canPortionPerFood(ai.items)) return ai;
  return { ...ai, ...sumEatenFoods(ai.items) };
}

/** 음식별 먹은 양을 지운다 (끼니 전체 먹은 양으로 저장할 때: 합계에 반영되지 않은 비율을 남기지 않는다). */
export function clearFoodPortions(ai: AiResult): AiResult {
  return { ...ai, items: ai.items.map((it) => ({ ...it, portion: null })) };
}

/**
 * 저장된 끼니가 음식별 먹은 양으로 기록됐는가: 끼니 먹은 양이 1이고, 모든 음식에 숫자가 있고,
 * 합계가 음식별 합과 같다. 예전 기록(끼니 먹은 양 ≠ 1)이나 합계를 직접 고친 기록은 false.
 */
export function usesFoodPortions(ai: AiResult, portion: number): boolean {
  if (portion !== 1 || !canPortionPerFood(ai.items)) return false;
  const s = sumEatenFoods(ai.items);
  return KEYS.every((k) => Math.round(ai[k]) === s[k]);
}

/**
 * 음식 줄에 보여 줄 실제 먹은 비율: 음식별 먹은 양 × 끼니 먹은 양 × 나눠 먹음.
 * 새 기록은 끼니 먹은 양이 1, 예전 기록은 음식별 먹은 양이 없어서(1) 어느 쪽이든 끼니 합계와 맞는다.
 */
export function foodFactor(item: Pick<FoodItem, 'portion'>, mealPortion: number, sharedMeal?: boolean): number {
  return itemPortion(item) * eatenFactor(mealPortion, sharedMeal);
}

/** 음식 하나의 실제 먹은 영양 (foodFactor를 곱한 값, 반올림 전) */
export function eatenFoodInMeal(item: FoodItem, mealPortion: number, sharedMeal?: boolean): Nutrition {
  const f = foodFactor(item, mealPortion, sharedMeal);
  return {
    kcal: (item.kcal ?? 0) * f,
    carbs: (item.carbs ?? 0) * f,
    protein: (item.protein ?? 0) * f,
    fat: (item.fat ?? 0) * f,
  };
}

/**
 * 기록 확인 화면에서 저장할 값.
 * 음식별 모드면 합계 = 먹은 음식 합, 끼니 먹은 양 = 1. 아니면 지금 합계와 끼니 먹은 양 그대로, 음식별 비율은 지운다.
 */
export function mealToSave(
  ai: AiResult,
  portion: number,
  manualTotals: boolean,
): { ai: AiResult; portion: number; perFood: boolean } {
  if (!manualTotals && canPortionPerFood(ai.items)) return { ai: withFoodPortions(ai), portion: 1, perFood: true };
  return { ai: clearFoodPortions(ai), portion, perFood: false };
}

/** 끼니 사진을 서버에 어떻게 맞출지 (사진 백업을 켰거나 친구에게 공유한 끼니만 서버에 사진이 있다). */
export type PhotoSync = 'upload' | 'delete' | 'none';

export function photoSync(p: {
  uri: string | null; // 이번에 저장한 사진 (없으면 null)
  prevUri: string | null | undefined; // 같은 끼니에 전에 저장돼 있던 사진
  prevShared: boolean | undefined; // 전 기록이 친구에게 공유됐는가
  shareFriends: boolean;
  photoBackup: boolean;
}): PhotoSync {
  const want = p.photoBackup || p.shareFriends;
  // 이 끼니 사진이 이미 서버에 있다: 사진 백업은 켤 때 전부 올리고 끌 때 전부 지우므로, 지금 켜져 있거나 전 기록이 공유였으면 있다.
  const had = !!p.prevUri && (p.photoBackup || !!p.prevShared);
  if (want && p.uri) return had && p.prevUri === p.uri ? 'none' : 'upload';
  return had ? 'delete' : 'none';
}
