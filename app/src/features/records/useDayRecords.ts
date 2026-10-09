import { and, asc, eq, gte, isNotNull, lt } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '../../db/client';
import { gymLogs, lockEvents, mealLogs } from '../../db/schema';
import { sumNutrition } from '../../domain/stats';
import { addDays, parseDateKey } from '../../domain/time';
import { loggedMealsOf } from './format';

/** 하루 상세: 그날 끼니·헬스 인증·잠금을 로컬 SQLite에서 읽는다. 기록이 바뀌면 자동 갱신. */
export function useDayRecords(date: string) {
  const startMs = parseDateKey(date).getTime();
  const endMs = addDays(parseDateKey(date), 1).getTime();

  const { data: meals } = useLiveQuery(db.select().from(mealLogs).where(eq(mealLogs.date, date)), [date]);
  const { data: gym } = useLiveQuery(
    db
      .select()
      .from(gymLogs)
      .where(and(eq(gymLogs.date, date), isNotNull(gymLogs.verifiedBy))),
    [date],
  );
  // 달력과 같은 기준: 그날 시작한 잠금
  const { data: locks } = useLiveQuery(
    db
      .select()
      .from(lockEvents)
      .where(and(gte(lockEvents.startedAt, startMs), lt(lockEvents.startedAt, endMs)))
      .orderBy(asc(lockEvents.startedAt)),
    [startMs, endMs],
  );

  return useMemo(() => {
    const logged = loggedMealsOf(meals, date);
    const lockedMeals = meals.filter((m) => m.status === 'locked').sort((a, b) => a.index - b.index);
    return { meals: logged, totals: sumNutrition(logged), lockedMeals, gym: gym[0] ?? null, locks };
  }, [date, meals, gym, locks]);
}
