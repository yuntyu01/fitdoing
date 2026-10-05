import { and, eq, gte, lte } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../../db/client';
import { mealLogs } from '../../db/schema';
import { addDays, dateKey, parseDateKey, weekKey } from '../../domain/time';
import type { WeeklyRow } from '../../domain/weekly';

/** 지난주 월요일부터 이번 주 일요일까지 기록한 끼니 (주간 그래프용) */
export function useWeeklyRows(now: Date): WeeklyRow[] {
  const mon = parseDateKey(weekKey(now));
  const from = dateKey(addDays(mon, -7));
  const to = dateKey(addDays(mon, 6));
  const { data } = useLiveQuery(
    db
      .select({ date: mealLogs.date, ai: mealLogs.ai, portion: mealLogs.portion, sharedMeal: mealLogs.sharedMeal })
      .from(mealLogs)
      .where(and(gte(mealLogs.date, from), lte(mealLogs.date, to), eq(mealLogs.status, 'logged'))),
    [from, to],
  );
  return data;
}
