import type { TFunction } from 'i18next';

import type { FoodItem, mealLogs } from '../../db/schema';
import { formatNumber, roundGram, roundKcal } from '../../domain/format';
import { foodFactor } from '../../domain/portion';
import type { Nutrition } from '../../domain/stats';
import { parseDateKey } from '../../domain/time';

/** 끼니 기록 한 줄 (로컬 SQLite 행 그대로) */
export type MealRow = typeof mealLogs.$inferSelect;

/** 그날 기록한 끼니를 1끼부터 순서대로 */
export function loggedMealsOf(logs: MealRow[], date: string): MealRow[] {
  return logs.filter((l) => l.date === date && l.status === 'logged').sort((a, b) => a.index - b.index);
}

/** epoch ms -> 'HH:mm' (기록 시각이 없으면 null) */
export function clock(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 먹은 비율 % (음식별 먹은 양 × 끼니 먹은 양 × 나눠 먹음). 하루 상세 음식 줄의 kcal과 같은 비율. */
export function eatenPct(item: FoodItem, meal: Pick<MealRow, 'portion' | 'sharedMeal'>): number {
  return Math.round(foodFactor(item, meal.portion, meal.sharedMeal) * 100);
}

/** 기록 탭 끼니 줄: "현미밥 75% · 닭가슴살". 다 먹은 음식은 이름만. 이름이 하나도 없으면 null (바코드·직접 입력만 한 끼니) */
export function eatenFoodNames(t: TFunction, meal: Pick<MealRow, 'ai' | 'portion' | 'sharedMeal'>): string | null {
  const parts = (meal.ai?.items ?? [])
    .filter((i) => i.name.trim())
    .map((i) => {
      const pct = eatenPct(i, meal);
      return pct === 100 ? i.name.trim() : t('records.foodPortion', { name: i.name.trim(), pct });
    });
  return parts.length ? parts.join(' · ') : null;
}

/** "1,160" (kcal은 10 단위 반올림) */
export const kcalText = (kcal: number) => formatNumber(roundKcal(kcal));

/** "탄 123g · 단 73g · 지 42g" */
export function macroText(t: TFunction, n: Pick<Nutrition, 'carbs' | 'protein' | 'fat'>): string {
  return t('records.macros', { c: roundGram(n.carbs), p: roundGram(n.protein), f: roundGram(n.fat) });
}

/** "9월 26일 토요일" */
export function fullDate(t: TFunction, date: string): string {
  const d = parseDateKey(date);
  const wd = String((d.getDay() + 6) % 7) as '0';
  return t('date.full', { month: d.getMonth() + 1, day: d.getDate(), weekday: t(`weekdayLong.${wd}`) });
}
