import { and, gte, isNotNull, lte } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '../../db/client';
import { gymLogs, lockEvents, mealLogs, sleepLogs } from '../../db/schema';
import { monthGrid, monthRange, monthSummary, type YearMonth } from '../../domain/calendar';
import { buildMonthFacts } from '../../domain/records';
import type { MealRow } from './format';

/** /api/records/month 와 같은 의미를 로컬 SQLite에서 읽는다. 기록이 바뀌면 자동 갱신. */
export function useMonthRecords(ym: YearMonth, mealsPlanned: number) {
  const { start, end } = monthRange(ym);
  const startMs = new Date(ym.year, ym.month, 1).getTime();
  const endMs = new Date(ym.year, ym.month + 1, 1).getTime();
  const deps = [start, end];

  const { data: meals } = useLiveQuery(
    db
      .select()
      .from(mealLogs)
      .where(and(gte(mealLogs.date, start), lte(mealLogs.date, end))),
    deps,
  );
  const { data: gym } = useLiveQuery(
    db
      .select()
      .from(gymLogs)
      .where(and(gte(gymLogs.date, start), lte(gymLogs.date, end), isNotNull(gymLogs.verifiedBy))),
    deps,
  );
  const { data: sleep } = useLiveQuery(
    db
      .select()
      .from(sleepLogs)
      .where(and(gte(sleepLogs.date, start), lte(sleepLogs.date, end), isNotNull(sleepLogs.lockedAt))),
    deps,
  );
  const { data: locks } = useLiveQuery(
    db
      .select()
      .from(lockEvents)
      .where(and(gte(lockEvents.startedAt, startMs), lte(lockEvents.startedAt, endMs - 1))),
    [startMs, endMs],
  );

  return useMemo(() => {
    const weeks = monthGrid(ym);
    const dates = weeks.flat().filter((d): d is string => d !== null);
    const facts = buildMonthFacts({
      dates,
      mealsPlanned,
      meals,
      gymDates: gym.map((g) => g.date),
      sleepDates: sleep.map((s) => s.date),
      lockStartedAt: locks.map((l) => l.startedAt),
    });
    const logs: MealRow[] = meals; // 하루 블록이 사진·기록 시각·음식 이름까지 쓴다
    return { weeks, facts: new Map(facts.map((f) => [f.date, f])), summary: monthSummary(facts), logs, list: facts };
  }, [ym, mealsPlanned, meals, gym, sleep, locks]);
}
