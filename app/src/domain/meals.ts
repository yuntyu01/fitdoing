import { addDays, atMinutes, dateKey, startOfDay, toMinutes } from './time';

export interface MealSlot {
  index: number; // 1부터
  deadline: string; // 'HH:mm'
}

export interface MealDeadline {
  index: number;
  date: string; // 이 끼니가 속한 날 (1끼 기준 날짜)
  at: Date; // 실제 마감 시각. 자정을 넘으면 다음 날 Date
}

/**
 * 하루치 끼니 마감을 실제 시각으로 펼친다.
 * 마감이 앞 끼니보다 이르거나 같으면 자정을 넘긴 것으로 보고 다음 날로 민다. (예: 6끼 00:30)
 */
export function deadlinesFor(day: Date, meals: MealSlot[]): MealDeadline[] {
  const sorted = [...meals].sort((a, b) => a.index - b.index);
  const key = dateKey(day);
  let offset = 0;
  let prev = -1;
  return sorted.map((m) => {
    let min = toMinutes(m.deadline) + offset;
    if (min <= prev) {
      offset += 1440;
      min += 1440;
    }
    prev = min;
    return { index: m.index, date: key, at: atMinutes(day, min) };
  });
}

export type TileState = 'logged' | 'current' | 'upcoming' | 'missed';

export interface MealStatus extends MealDeadline {
  state: TileState;
}

/**
 * 지금 기준 끼니 상태. 기록된 끼니는 logged, 마감 지난 미기록은 missed,
 * 마감 전 미기록 중 가장 이른 것 하나만 current, 나머지는 upcoming.
 */
export function mealStatuses(deadlines: MealDeadline[], logged: Set<number>, now: Date): MealStatus[] {
  let currentTaken = false;
  return deadlines.map((d) => {
    if (logged.has(d.index)) return { ...d, state: 'logged' };
    if (d.at.getTime() <= now.getTime()) return { ...d, state: 'missed' };
    if (!currentTaken) {
      currentTaken = true;
      return { ...d, state: 'current' };
    }
    return { ...d, state: 'upcoming' };
  });
}

/**
 * 지금이 어느 날의 끼니 일정에 속하는지.
 * 어제 일정의 마지막 마감이 아직 안 지났으면(자정 넘긴 끼니) 어제, 아니면 오늘.
 */
export function scheduleDay(meals: MealSlot[], now: Date): Date {
  const yesterday = addDays(startOfDay(now), -1);
  const y = deadlinesFor(yesterday, meals);
  const last = y[y.length - 1];
  if (last && last.at.getTime() > now.getTime()) return yesterday;
  return startOfDay(now);
}

/** 끼니 수를 바꿀 때 쓰는 기본 마감 시각 */
export const DEFAULT_DEADLINES: Record<number, string[]> = {
  3: ['09:00', '14:00', '20:00'],
  4: ['08:00', '14:00', '17:00', '19:00'],
  5: ['08:00', '11:00', '14:00', '17:00', '20:00'],
  6: ['08:00', '10:30', '13:00', '15:30', '18:00', '21:00'],
};

/** 끼니 수를 바꾼다. 이미 있던 끼니의 마감은 유지하고, 새 끼니는 기본값. */
export function resizeMeals(meals: MealSlot[], count: number): MealSlot[] {
  const defaults = DEFAULT_DEADLINES[count] ?? DEFAULT_DEADLINES[4];
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    deadline: meals.length === count ? meals[i].deadline : defaults[i],
  }));
}
