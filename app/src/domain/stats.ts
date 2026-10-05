import type { Targets } from './targets';
import { addDays, dateKey, parseDateKey, startOfDay, weekKey, weekdayMon0 } from './time';

/**
 * 연속 기록 일수. 오늘 기록이 있으면 오늘부터, 없으면 어제부터 거꾸로 센다.
 * (오늘 아직 안 찍었다고 연속이 끊긴 것으로 보이지 않게)
 */
export function streak(loggedDates: Set<string>, now: Date): number {
  let d = startOfDay(now);
  if (!loggedDates.has(dateKey(d))) d = addDays(d, -1);
  let n = 0;
  while (loggedDates.has(dateKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** 이번 주 헬스: 인증한 날 수 / 계획한 요일 수 */
export function gymWeek(verifiedDates: string[], plannedDays: number[], now: Date) {
  const wk = weekKey(now);
  const done = new Set(verifiedDates.filter((d) => weekKey(parseDateKey(d)) === wk)).size;
  return { done, planned: plannedDays.length };
}

export function isGymDay(plannedDays: number[], d: Date): boolean {
  return plannedDays.includes(weekdayMon0(d));
}

export interface Nutrition {
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
}

/** 먹은 만큼의 비율. 나눠 먹었으면 절반 (서버 meal.Factor 와 같은 규칙). */
export function eatenFactor(portion: number, sharedMeal?: boolean): number {
  return portion * (sharedMeal ? 0.5 : 1);
}

/** 먹은 비율(portion, 나눠 먹음)을 곱해서 더한다. 반올림은 표시할 때 한다. */
export function sumNutrition(items: { ai: Nutrition | null; portion: number; sharedMeal?: boolean }[]): Nutrition {
  return items.reduce<Nutrition>(
    (acc, { ai, portion, sharedMeal }) => {
      if (!ai) return acc;
      const f = eatenFactor(portion, sharedMeal);
      return {
        kcal: acc.kcal + ai.kcal * f,
        carbs: acc.carbs + ai.carbs * f,
        protein: acc.protein + ai.protein * f,
        fat: acc.fat + ai.fat * f,
      };
    },
    { kcal: 0, carbs: 0, protein: 0, fat: 0 },
  );
}

/** 막대 채움 비율 0~1. 목표를 넘어도 1에서 멈춘다 (초과로 잠그지 않으니 경고 색도 없다). */
export function ratio(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(1, Math.max(0, value / target));
}

export type { Targets };
