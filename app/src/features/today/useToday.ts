import { and, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { db } from '../../db/client';
import { gymLogs, mealLogs, type Settings } from '../../db/schema';
import { deadlinesFor, mealStatuses, scheduleDay } from '../../domain/meals';
import { gymWeek, isGymDay, streak, sumNutrition } from '../../domain/stats';
import { addDays, dateKey, parseDateKey, weekKey } from '../../domain/time';

/** 분이 바뀔 때마다, 그리고 앱이 앞으로 올 때 갱신되는 현재 시각 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(new Date());
    const timeout = setTimeout(
      () => {
        tick();
        interval = setInterval(tick, 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
      sub.remove();
    };
  }, []);
  return now;
}

export function useToday(settings: Settings, now: Date) {
  const day = scheduleDay(settings.meals, now);
  const key = dateKey(day);
  const wk = weekKey(now);
  const wkEnd = dateKey(addDays(parseDateKey(wk), 6));

  const { data: logs } = useLiveQuery(db.select().from(mealLogs).where(eq(mealLogs.date, key)), [key]);
  const { data: loggedDays } = useLiveQuery(
    db.selectDistinct({ date: mealLogs.date }).from(mealLogs).where(eq(mealLogs.status, 'logged')),
  );
  const { data: gymThisWeek } = useLiveQuery(
    db
      .select()
      .from(gymLogs)
      .where(and(gte(gymLogs.date, wk), lte(gymLogs.date, wkEnd), isNotNull(gymLogs.verifiedBy))),
    [wk],
  );

  return useMemo(() => {
    const logged = logs.filter((l) => l.status === 'logged');
    const loggedAt = new Map(logged.map((l) => [l.index, l.loggedAt]));
    const meals = mealStatuses(deadlinesFor(day, settings.meals), new Set(loggedAt.keys()), now).map((m) => ({
      ...m,
      loggedAt: loggedAt.get(m.index) ?? null,
      log: logged.find((l) => l.index === m.index) ?? null,
    }));
    const daySet = new Set(loggedDays.map((d) => d.date));
    const gymDates = gymThisWeek.map((g) => g.date);

    return {
      day,
      meals,
      current: meals.find((m) => m.state === 'current') ?? null,
      loggedCount: logged.length,
      totals: sumNutrition(logged),
      streak: streak(daySet, now),
      loggedDays: daySet,
      gym: {
        ...gymWeek(gymDates, settings.gym.weeklyTarget, now),
        today: isGymDay(settings.gym.days, now),
        doneToday: gymDates.includes(dateKey(now)),
      },
    };
  }, [logs, loggedDays, gymThisWeek, day, settings, now]);
}

export type TodayData = ReturnType<typeof useToday>;
