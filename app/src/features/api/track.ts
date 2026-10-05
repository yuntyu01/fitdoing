import { and, eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { couponUses, gymLogs, lockEvents, mealLogs, settings as settingsTable, sleepLogs } from '../../db/schema';
import { toMealBackup } from '../../domain/logging';
import {
  couponItem,
  gymItem,
  initialSyncItems,
  lockItem,
  sleepItem,
  toCouponUseBody,
  toGymLogBody,
  toLockEventBody,
  toSleepLogBody,
  type CouponKind,
  type LockKind,
  type QueueItem,
} from '../../domain/sync';
import { enqueueItems, flushQueue } from './client';
import { initSyncState, readMeta, writeMeta } from './store';

// 로컬 DB에 기록을 쓴 지점에서 부르는 "이 행을 서버로" 함수들. 방금 쓴 행을 DB에서 다시 읽어 큐에 넣는다.
// 전부 best effort: 던지지 않고, 기다릴 필요도 없다.

const guard = (fn: () => QueueItem[]) => {
  try {
    void enqueueItems(fn());
  } catch (e) {
    console.warn('sync track failed', e);
  }
};

export function trackGym(date: string) {
  guard(() => {
    const r = db.select().from(gymLogs).where(eq(gymLogs.date, date)).get();
    const b = r && toGymLogBody(r);
    return b ? [gymItem(b)] : [];
  });
}

export function trackSleep(date: string) {
  guard(() => {
    const r = db.select().from(sleepLogs).where(eq(sleepLogs.date, date)).get();
    return r ? [sleepItem(toSleepLogBody(r))] : [];
  });
}

export function trackLock(type: LockKind, startedAt: number) {
  guard(() => {
    const r = db
      .select()
      .from(lockEvents)
      .where(and(eq(lockEvents.type, type), eq(lockEvents.startedAt, startedAt)))
      .get();
    return r ? [lockItem(toLockEventBody(r))] : [];
  });
}

export function trackCoupon(type: CouponKind, usedAt: number) {
  guard(() => {
    const r = db
      .select()
      .from(couponUses)
      .where(and(eq(couponUses.type, type), eq(couponUses.usedAt, usedAt)))
      .get();
    return r ? [couponItem(toCouponUseBody(r))] : [];
  });
}

/** 로컬 전체 기록을 큐에 넣는다. */
function allLocalItems(): QueueItem[] {
  return initialSyncItems(
    {
      settings: db.select().from(settingsTable).get()?.json ?? null,
      meals: db.select().from(mealLogs).all(),
      gymLogs: db.select().from(gymLogs).all(),
      sleepLogs: db.select().from(sleepLogs).all(),
      lockEvents: db.select().from(lockEvents).all(),
      couponUses: db.select().from(couponUses).all(),
    },
    (m) => toMealBackup({ ...m, ai: m.ai!, loggedAt: m.loggedAt! }),
  );
}

/**
 * 앱 시작·온보딩 직후 한 번: 이미 로컬에 있는 기록을 모두 서버로 올린다.
 * 설정이 아직 없으면(온보딩 전) 아무것도 하지 않고, 올렸다는 표시는 큐에 넣은 뒤에만 남긴다.
 * 시작 때마다 큐 비우기도 함께 시도한다.
 */
export async function startSync(): Promise<void> {
  try {
    await initSyncState();
    if (!readMeta().initialDone && db.select().from(settingsTable).get()) {
      writeMeta({ initialDone: true }); // 넘쳐서 버리면 enqueueItems가 다시 false로 돌린다
      await enqueueItems(allLocalItems());
    }
  } catch (e) {
    console.warn('initial sync failed', e);
  }
  flushQueue(true).catch(() => {});
}
