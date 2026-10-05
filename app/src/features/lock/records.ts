import { and, eq, gte, isNotNull, isNull } from 'drizzle-orm';

import { db } from '../../db/client';
import { gymLogs, lockEvents, mealLogs, settings as settingsTable, sleepLogs, type Settings } from '../../db/schema';
import {
  lockKey,
  naturalEnd,
  type ActiveLock,
  type LockSnapshot,
  type LockType,
  type ReleaseBy,
} from '../../domain/lock';
import { mealKey } from '../../domain/notifications';
import { addDays, dateKey, startOfDay } from '../../domain/time';
import { trackGym, trackLock, trackSleep } from '../api/track';

// 잠금 판정에 필요한 기록을 DB에서 읽고, 잠금 시작·해제를 lock_events에 남긴다.
// 잠금의 startedAt은 판정이 정하는 값(마감·도착·취침 시각)이라 같은 잠금은 항상 같은 키가 된다.

export function loadSnapshot(settings: Settings, now: Date): LockSnapshot {
  const from = dateKey(addDays(startOfDay(now), -1));
  const meals = db
    .select({ date: mealLogs.date, index: mealLogs.index })
    .from(mealLogs)
    .where(and(gte(mealLogs.date, from), eq(mealLogs.status, 'logged')))
    .all();
  const gym = db
    .select({ date: gymLogs.date })
    .from(gymLogs)
    .where(and(gte(gymLogs.date, from), isNotNull(gymLogs.verifiedBy)))
    .all();
  const events = db
    .select()
    .from(lockEvents)
    .where(and(gte(lockEvents.startedAt, addDays(startOfDay(now), -2).getTime()), isNotNull(lockEvents.releasedBy)))
    .all();
  const row = db.select({ updatedAt: settingsTable.updatedAt }).from(settingsTable).get();

  return {
    now,
    settings,
    loggedMeals: new Set(meals.map((m) => mealKey(m.date, m.index))),
    gymDoneDates: new Set(gym.map((g) => g.date)),
    released: new Set(events.map((e) => lockKey(e.type, e.startedAt))),
    notBefore: row?.updatedAt,
  };
}

function openEvents(type: LockType) {
  return db
    .select()
    .from(lockEvents)
    .where(and(eq(lockEvents.type, type), isNull(lockEvents.endedAt)))
    .all();
}

/** 잠금이 걸린 걸 처음 보면 시작 기록을 남긴다. 겹친 잠금(covers)도 함께. */
export function ensureStarted(lock: ActiveLock) {
  const open = new Set(openEvents(lock.type).map((e) => e.startedAt));
  const done = db
    .select({ startedAt: lockEvents.startedAt })
    .from(lockEvents)
    .where(eq(lockEvents.type, lock.type))
    .all();
  const known = new Set([...open, ...done.map((e) => e.startedAt)]);
  for (const startedAt of lock.covers) {
    if (known.has(startedAt)) continue;
    db.insert(lockEvents).values({ type: lock.type, startedAt }).run();
    trackLock(lock.type, startedAt);
    if (lock.type === 'sleep') {
      const date = dateKey(new Date(startedAt));
      db.insert(sleepLogs).values({ date, lockedAt: startedAt }).onConflictDoNothing().run();
      trackSleep(date);
    }
  }
}

function closeEvent(ev: { id: number; type: LockType; startedAt: number }, endedAt: number, by: ReleaseBy) {
  db.update(lockEvents).set({ endedAt, releasedBy: by }).where(eq(lockEvents.id, ev.id)).run();
  trackLock(ev.type, ev.startedAt);
  if (ev.type === 'sleep') {
    const date = dateKey(new Date(ev.startedAt));
    db.update(sleepLogs).set({ unlockedAt: endedAt }).where(eq(sleepLogs.date, date)).run();
    trackSleep(date);
  }
}

/** 해제 수단을 기록하고 그 종류의 열린 잠금을 모두 닫는다. 닫은 개수를 돌려준다. */
export function closeOpen(type: LockType, by: ReleaseBy, now: Date): number {
  const evs = openEvents(type);
  for (const ev of evs) closeEvent(ev, now.getTime(), by);
  return evs.length;
}

/** 더 이상 걸려 있지 않은데 열려 있는 기록을 시간 해제로 닫는다. 끝난 시각은 원래 풀렸어야 할 시각. */
export function closeStale(active: ActiveLock | null, settings: Settings, now: Date) {
  for (const type of ['meal', 'gym', 'sleep'] as const) {
    for (const ev of openEvents(type)) {
      if (active?.type === type && active.covers.includes(ev.startedAt)) continue;
      const end = Math.min(now.getTime(), naturalEnd(type, ev.startedAt, settings));
      closeEvent(ev, end, 'time');
    }
  }
}

/** 헬스 도착 확인. 지오펜스·사진·휴식권 모두 gym_logs에 남고, 이 기록이 잠금을 푼다. */
export function markGymDone(by: 'geofence' | 'photo' | 'rest', now: Date) {
  const date = dateKey(now);
  db.insert(gymLogs)
    .values({ date, checkInAt: now.getTime(), verifiedBy: by })
    .onConflictDoUpdate({ target: gymLogs.date, set: { checkInAt: now.getTime(), verifiedBy: by } })
    .run();
  trackGym(date);
}
