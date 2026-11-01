import { db } from '../../db/client';
import { gymLogs } from '../../db/schema';
import { dateKey } from '../../domain/time';
import { trackGym } from '../api/track';

/** 오늘 헬스를 인증한다. 'geofence'는 위치로 도착을 확인했을 때, 'photo'는 사진 인증을 마쳤을 때. */
export function markGymDone(by: 'geofence' | 'photo', now = new Date()) {
  const date = dateKey(now);
  db.insert(gymLogs)
    .values({ date, checkInAt: now.getTime(), verifiedBy: by })
    .onConflictDoUpdate({ target: gymLogs.date, set: { checkInAt: now.getTime(), verifiedBy: by } })
    .run();
  trackGym(date);
}
