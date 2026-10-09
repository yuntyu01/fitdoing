import { and, eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { couponUses, gymLogs, lockEvents, mealLogs, settings as settingsTable, sleepLogs } from '../../db/schema';
import { toMealBackup } from '../../domain/logging';
import type { PhotoSync } from '../../domain/portion';
import {
  couponItem,
  gymItem,
  initialSyncItems,
  lockItem,
  PHOTO_WIPE,
  photoItem,
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

/**
 * 방금 기록한 끼니의 사진을 서버에 맞춘다. 사진 백업을 켰거나 친구에게 공유한 끼니만 올리고,
 * 공유했던 끼니를 공유 없이(또는 사진 없이) 다시 기록했으면 서버 사진을 지운다. 판단은 domain/portion의 photoSync.
 * 끼니 백업보다 뒤에 보낸다(planRequests 순서).
 */
export function trackMealPhoto(date: string, index: number, uri: string | null, action: PhotoSync) {
  if (action === 'none') return;
  guard(() => [photoItem({ date, index, uri: action === 'upload' ? uri : null })]);
}

/**
 * 설정에서 사진 백업을 바꿨을 때. 켜면 폰에 있는 끼니 사진을 모두 올리고, 끄면 서버의 사진을 모두 지운다
 * (아직 못 올린 사진은 보내지 않는다).
 */
export function photoBackupChanged(on: boolean) {
  guard(() => {
    const meals = db.select().from(mealLogs).where(eq(mealLogs.status, 'logged')).all();
    const withPhoto = meals.filter((m) => m.photoUri);
    // 끄면 서버 사진을 모두 지우되, 친구에게 공유한 끼니의 사진은 친구가 계속 볼 수 있게 지운 뒤 다시 올린다
    if (!on) {
      const shared = withPhoto.filter((m) => m.shareFriends);
      return [PHOTO_WIPE, ...shared.map((m) => photoItem({ date: m.date, index: m.index, uri: m.photoUri }))];
    }
    return withPhoto.map((m) => photoItem({ date: m.date, index: m.index, uri: m.photoUri }));
  });
}

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
