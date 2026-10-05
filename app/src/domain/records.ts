import type { AiResult } from '../db/schema';
import { dayState, type DayFacts, type DayState } from './calendar';
import { sumNutrition, type Nutrition } from './stats';
import { dateKey } from './time';

export interface MealLogRow {
  date: string;
  index: number;
  photoUri: string | null;
  ai: AiResult | null;
  portion: number;
  status: 'pending' | 'logged' | 'overdue' | 'locked';
}

export interface MonthInput {
  dates: string[]; // 그 달의 모든 날
  mealsPlanned: number;
  meals: Pick<MealLogRow, 'date' | 'status'>[];
  gymDates: string[]; // 인증한 날
  sleepDates: string[];
  lockStartedAt: number[]; // lock_events.started_at (epoch ms)
}

/** 달 전체를 날짜별 사실로 만든다. 로컬 SQLite에서 읽은 행을 그대로 넣는다. */
export function buildMonthFacts(input: MonthInput): DayFacts[] {
  const logged = new Map<string, number>();
  const lockedDays = new Set<string>();
  for (const m of input.meals) {
    if (m.status === 'logged') logged.set(m.date, (logged.get(m.date) ?? 0) + 1);
    if (m.status === 'locked') lockedDays.add(m.date);
  }
  for (const at of input.lockStartedAt) lockedDays.add(dateKey(new Date(at)));
  const gym = new Set(input.gymDates);
  const sleep = new Set(input.sleepDates);
  return input.dates.map((date) => ({
    date,
    mealsLogged: logged.get(date) ?? 0,
    mealsPlanned: input.mealsPlanned,
    locked: lockedDays.has(date),
    gym: gym.has(date),
    sleep: sleep.has(date),
  }));
}

export interface DayDetail {
  date: string;
  state: DayState;
  totals: Nutrition;
  meals: { index: number; photoUri: string | null; logged: boolean }[]; // 1끼~N끼 빈 칸 포함
  gym: boolean;
  locked: boolean;
  sleep: boolean;
  empty: boolean;
}

/** 누른 날 카드. 서버 /api/records/day 와 같은 의미. */
export function buildDayDetail(facts: DayFacts, logs: MealLogRow[]): DayDetail {
  const day = logs.filter((l) => l.date === facts.date);
  const logged = day.filter((l) => l.status === 'logged');
  const byIndex = new Map(logged.map((l) => [l.index, l]));
  const meals = Array.from({ length: facts.mealsPlanned }, (_, i) => {
    const l = byIndex.get(i + 1);
    return { index: i + 1, photoUri: l?.photoUri ?? null, logged: !!l };
  });
  return {
    date: facts.date,
    state: dayState(facts),
    totals: sumNutrition(logged),
    meals,
    gym: facts.gym,
    locked: facts.locked,
    sleep: facts.sleep,
    empty: logged.length === 0 && !facts.gym && !facts.locked && !facts.sleep,
  };
}
