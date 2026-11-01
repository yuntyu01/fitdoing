import { eq, isNotNull } from 'drizzle-orm';

import { db } from '../../db/client';
import { mealLogs, type Settings } from '../../db/schema';
import { photosToPurge } from '../../domain/photoKeep';
import { deleteStoredPhoto } from './photos';

/** 보관 기간이 지난 끼니 사진을 폰에서 지운다. 기록(칼로리 등)과 서버 백업은 그대로 둔다. 계속 보관이면 아무것도 안 한다. */
export function purgeOldPhotos(settings: Settings, now = new Date()) {
  if (settings.photoKeepDays === null) return;
  const rows = db
    .select({ id: mealLogs.id, date: mealLogs.date, photoUri: mealLogs.photoUri })
    .from(mealLogs)
    .where(isNotNull(mealLogs.photoUri))
    .all();
  for (const r of photosToPurge(rows, settings.photoKeepDays, now)) {
    deleteStoredPhoto(r.photoUri);
    db.update(mealLogs).set({ photoUri: null }).where(eq(mealLogs.id, r.id)).run();
  }
}
