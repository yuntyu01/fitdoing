import type { AiResult, FoodItem } from '../db/schema';
import type { MealStatus } from './meals';
import { sumNutrition, type Nutrition } from './stats';

// 촬영 → 기록 확인 → 저장에 쓰는 순수 함수 모음.

// 1.5·2는 곱빼기·2인분처럼 AI가 1인분으로 본 양보다 많이 먹었을 때. 사진으로는 그릇 크기를 잘 못 가려서 사람이 고친다.
export const PORTIONS = [0.25, 0.5, 1, 1.5, 2] as const;
export type Portion = (typeof PORTIONS)[number];

export const PHOTO_MAX_EDGE = 1024; // 서버로 보내는 사진의 긴 변(px)

export const EMPTY_AI: AiResult = { items: [], kcal: 0, carbs: 0, protein: 0, fat: 0, confidence: 0 };

/**
 * 기록할 끼니를 자동으로 고른다.
 * 현재 마감 끼니 > 마감이 지났지만 못 찍은 끼니 중 가장 최근 > 아직 안 찍은 첫 끼니 > 마지막 끼니.
 */
export function pickMealIndex(meals: Pick<MealStatus, 'index' | 'state'>[]): number | null {
  if (meals.length === 0) return null;
  const current = meals.find((m) => m.state === 'current');
  if (current) return current.index;
  const missed = meals.filter((m) => m.state === 'missed');
  if (missed.length > 0) return missed[missed.length - 1].index;
  const open = meals.find((m) => m.state !== 'logged');
  return (open ?? meals[meals.length - 1]).index;
}

/** 먹은 양을 반영한 추정 영양 (반올림 전 값). */
export function applyPortion(ai: Nutrition, portion: number, sharedMeal = false): Nutrition {
  return sumNutrition([{ ai, portion, sharedMeal }]);
}

/** 서버가 정수만 받으므로, 직접 고친 숫자는 0 이상 정수로 맞춘다. */
const FOOD_NUMBERS = ['kcal', 'carbs', 'protein', 'fat'] as const;

/** 음식별로 먹은 양을 고르는 단계 */
export const ITEM_PORTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;
export type ItemPortion = (typeof ITEM_PORTIONS)[number];

/** 음식 하나: 이름·양을 다듬고, 음식별 칼로리·탄단지는 있을 때만 0 이상 정수로 둔다(없으면 null). */
export function sanitizeItem(i: FoodItem): FoodItem {
  const out: FoodItem = { name: String(i.name ?? '').trim(), amount: String(i.amount ?? '').trim() };
  for (const k of FOOD_NUMBERS) {
    const v = i[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null;
  }
  out.portion =
    typeof i.portion === 'number' && (ITEM_PORTIONS as readonly number[]).includes(i.portion) ? i.portion : null;
  return out;
}

export function sanitizeAi(ai: AiResult): AiResult {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  const c = Number.isFinite(ai.confidence) ? Math.min(1, Math.max(0, ai.confidence)) : 0;
  return {
    items: ai.items.map(sanitizeItem).filter((i) => i.name !== ''),
    kcal: n(ai.kcal),
    carbs: n(ai.carbs),
    protein: n(ai.protein),
    fat: n(ai.fat),
    confidence: c,
  };
}

/** 긴 변이 max를 넘으면 그 변만 max로 줄이는 크기. 이미 작으면 null(그대로). */
export function resizeTarget(
  width: number,
  height: number,
  max = PHOTO_MAX_EDGE,
): { width: number } | { height: number } | null {
  if (width <= 0 || height <= 0 || Math.max(width, height) <= max) return null;
  return width >= height ? { width: max } : { height: max };
}

/** 앱 문서 디렉터리 안 사진 파일 이름. 같은 끼니를 다시 찍어도 겹치지 않게 시각을 붙인다. */
export function photoFileName(date: string, index: number, at: number): string {
  return `${date}_${index}_${at}.jpg`;
}

/** 'file:///a/b/c.jpg' 같은 uri에서 파일 이름만. */
export function baseName(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1);
}

/** 바코드는 숫자·영문만 남긴다. 비면 null. */
export function cleanBarcode(raw: string | null | undefined): string | null {
  const v = (raw ?? '').replace(/[^0-9A-Za-z]/g, '');
  return v === '' ? null : v;
}

/** 서버 POST /api/meals 본문 */
export interface MealBackup {
  date: string;
  index: number;
  deadline: string;
  barcode: string | null;
  ai: AiResult;
  portion: number;
  sharedMeal: boolean;
  shareFriends: boolean;
  cheat: boolean;
  loggedAt: string; // ISO
}

export function toMealBackup(m: {
  date: string;
  index: number;
  deadline: string;
  barcode: string | null;
  ai: AiResult;
  portion: number;
  sharedMeal: boolean;
  shareFriends?: boolean;
  loggedAt: number;
}): MealBackup {
  return {
    date: m.date,
    index: m.index,
    deadline: m.deadline,
    barcode: m.barcode,
    ai: sanitizeAi(m.ai),
    portion: m.portion,
    sharedMeal: m.sharedMeal,
    shareFriends: m.shareFriends ?? false,
    cheat: false,
    loggedAt: new Date(m.loggedAt).toISOString(),
  };
}
