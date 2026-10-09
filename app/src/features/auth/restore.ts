import { and, eq } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';

import { db } from '../../db/client';
import { couponUses, gymLogs, lockEvents, mealLogs, settings as settingsTable, sleepLogs } from '../../db/schema';
import { snapshotToRows, type Snapshot } from '../../domain/restore';
import { downloadMealPhoto } from '../api/client';
import { resetSyncState, writeMeta } from '../api/store';
import { getLockEngine } from '../lock/engine';
import { useLock } from '../lock/store';
import { deleteStoredPhoto, saveDownloadedPhoto } from '../meals/photos';
import { rescheduleNotifications } from '../notifications/schedule';
import { initialSettings } from '../settings/defaults';
import { useSettings } from '../settings/store';

// 폰의 기록(로컬 SQLite)을 통째로 지우거나, 서버 스냅샷으로 다시 채운다.
// 계정이 바뀌었거나, 새로 깐 폰이 서버에서 되살아날 때, 회원 탈퇴 때 쓴다.

const SETTINGS_ROW_ID = 1;

/** 끼니 사진 파일을 지운다. 파일이 없거나 지우다 실패해도 넘어간다. */
function deletePhotos() {
  try {
    for (const m of db.select({ photoUri: mealLogs.photoUri }).from(mealLogs).all()) deleteStoredPhoto(m.photoUri);
  } catch (e) {
    console.warn('photo cleanup failed', e);
  }
}

/** 잠금 엔진에 걸려 있던 잠금과 예약된 알림을 걷는다. (엔진 일정은 다음 설정 저장 때 새로 넘어간다) */
async function stopSchedules() {
  const engine = getLockEngine();
  await Promise.all((['meal', 'gym', 'sleep'] as const).map((t) => engine.releaseLock(t).catch(() => {})));
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

/** 한 트랜잭션으로 모든 기록 테이블을 비운다. */
function clearTables() {
  db.transaction((tx) => {
    tx.delete(mealLogs).run();
    tx.delete(gymLogs).run();
    tx.delete(sleepLogs).run();
    tx.delete(lockEvents).run();
    tx.delete(couponUses).run();
    tx.delete(settingsTable).run();
  });
}

/** 폰의 기록·대기 중인 백업·사진을 모두 지운다. 설정이 없어지므로 화면은 온보딩으로 간다. */
export async function wipeLocalData(): Promise<void> {
  deletePhotos();
  clearTables();
  await resetSyncState();
  await stopSchedules();
  useSettings.getState().load();
  useLock.setState({ active: null, notifyOnly: null });
}

/**
 * 서버 스냅샷으로 폰 DB를 다시 채운다(기존 기록은 지운다). 지우고 채우기는 한 트랜잭션이라 중간에 실패하면 원래대로 남는다.
 * 끼니 사진은 서버에 올린 적이 없으니 복원된 끼니에는 사진이 없다(photoUri = null, 기록 화면은 사진 없는 끼니를 이미 그린다).
 */
export async function restoreFromSnapshot(snapshot: Snapshot): Promise<void> {
  const rows = snapshotToRows(snapshot, initialSettings());
  if (!rows.settings) throw new Error('snapshot has no settings');
  const settings = rows.settings;

  deletePhotos();
  db.transaction((tx) => {
    tx.delete(mealLogs).run();
    tx.delete(gymLogs).run();
    tx.delete(sleepLogs).run();
    tx.delete(lockEvents).run();
    tx.delete(couponUses).run();
    tx.delete(settingsTable).run();
    tx.insert(settingsTable).values({ id: SETTINGS_ROW_ID, json: settings, updatedAt: Date.now() }).run();
    for (const m of rows.meals) tx.insert(mealLogs).values(m).onConflictDoNothing().run();
    for (const g of rows.gymLogs) tx.insert(gymLogs).values(g).onConflictDoNothing().run();
    for (const s of rows.sleepLogs) tx.insert(sleepLogs).values(s).onConflictDoNothing().run();
    for (const l of rows.lockEvents) tx.insert(lockEvents).values(l).run();
    for (const c of rows.couponUses) tx.insert(couponUses).values(c).run();
  });

  // 서버와 같아졌으니 대기 중인 옛 백업은 버리고, "처음 전체 올림"도 끝난 것으로 본다.
  await resetSyncState();
  writeMeta({ initialDone: true });

  useSettings.getState().load();
  useLock.getState().refresh();
  rescheduleNotifications(settings).catch((e) => console.warn('reschedule failed', e));
  void restorePhotos(snapshot.photos ?? []);
}

/**
 * 백업해 둔 끼니 사진을 받아 복원한 끼니에 붙인다. 화면을 막지 않고 뒤에서 하나씩, 실패한 사진은 건너뛴다
 * (기록 탭에서 썸네일만 빠진다).
 */
async function restorePhotos(refs: { date: string; index: number }[]): Promise<void> {
  for (const r of refs) {
    try {
      const bytes = await downloadMealPhoto(r.date, r.index);
      if (!bytes) continue;
      const uri = saveDownloadedPhoto(bytes, r.date, r.index, Date.now());
      db.update(mealLogs)
        .set({ photoUri: uri })
        .where(and(eq(mealLogs.date, r.date), eq(mealLogs.index, r.index)))
        .run();
    } catch (e) {
      console.warn('photo restore failed', r, e);
    }
  }
}
