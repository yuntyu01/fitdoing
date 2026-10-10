import * as Notifications from 'expo-notifications';
import { randomUUID } from 'expo-crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { mealLogs, type AiResult, type Settings } from '../../db/schema';
import { sanitizeAi, toMealBackup } from '../../domain/logging';
import { isExtra } from '../../domain/meals';
import { photoSync } from '../../domain/portion';
import { backupMeal } from '../api/client';
import { trackMealPhoto } from '../api/track';
import { rescheduleNotifications } from '../notifications/schedule';
import { notifyMealLogged } from './hooks';
import { deleteStoredPhoto } from './photos';

export interface LogMealInput {
  date: string;
  index: number;
  deadline: string;
  photoUri: string | null; // 이미 문서 디렉터리에 저장된 경로 (수정할 때 사진을 안 바꿨으면 원래 경로)
  /** 같은 끼니의 2·3번째 사진 (문서 디렉터리 경로). 없으면 빈 배열 */
  extraPhotoUris?: string[];
  barcode: string | null;
  ai: AiResult; // 합계에는 음식별 먹은 양이 이미 반영돼 있다 (domain/portion mealToSave)
  portion: number;
  sharedMeal: boolean;
  shareFriends: boolean;
  /** 저장된 끼니를 고칠 때 원래 기록 시각. 있으면 시각을 그대로 두고, 새 기록이 아니라서 잠금 해제 훅도 부르지 않는다. */
  loggedAt?: number;
}

/**
 * 끼니를 로컬 SQLite에 기록한다(진실). 같은 날 같은 끼니가 있으면 덮어쓴다(지난 날 끼니 수정도 같은 길).
 * 그 뒤 알림 정리 → 잠금 해제 훅 → 서버 백업(best effort) 순으로 이어지며, 뒤쪽 실패는 기록에 영향이 없다.
 */
export async function logMeal(input: LogMealInput, settings: Settings): Promise<void> {
  const ai = sanitizeAi(input.ai);
  const editing = input.loggedAt != null;
  const loggedAt = input.loggedAt ?? Date.now();

  const prev = db
    .select()
    .from(mealLogs)
    .where(and(eq(mealLogs.date, input.date), eq(mealLogs.index, input.index)))
    .get();

  const values = {
    id: prev?.id ?? randomUUID(),
    date: input.date,
    index: input.index,
    deadline: input.deadline,
    photoUri: input.photoUri,
    extraPhotoUris: input.extraPhotoUris?.length ? input.extraPhotoUris : null,
    barcode: input.barcode,
    ai,
    portion: input.portion,
    sharedMeal: input.sharedMeal,
    shareFriends: input.shareFriends,
    loggedAt,
    status: 'logged' as const,
  };
  db.insert(mealLogs)
    .values(values)
    .onConflictDoUpdate({ target: [mealLogs.date, mealLogs.index], set: values })
    .run();

  // 사진을 바꿨을 때만 옛 파일을 지운다 (수정에서 사진을 그대로 두면 같은 경로라 남는다).
  if (prev?.photoUri && prev.photoUri !== input.photoUri) deleteStoredPhoto(prev.photoUri);
  for (const old of prev?.extraPhotoUris ?? []) if (!input.extraPhotoUris?.includes(old)) deleteStoredPhoto(old);

  // 찍은 끼니의 예약 알림을 빼고, 떠 있는 알림은 치운다.
  rescheduleNotifications(settings).catch((e) => console.warn('reschedule failed', e));
  // 기타(간식 등)는 계획한 끼니가 아니라서 끼니 잠금·마감과 상관없다
  if (!editing && !isExtra(input.index)) {
    Notifications.dismissAllNotificationsAsync().catch(() => {});
    void notifyMealLogged({ date: input.date, index: input.index, loggedAt });
  }
  void backupMeal(toMealBackup({ ...values, ai }));
  // 사진은 사진 백업을 켰거나 친구에게 공유한 끼니만 서버에 둔다. 공유했던 끼니를 공유 없이 다시 기록하면 지운다.
  const action = photoSync({
    uri: input.photoUri,
    prevUri: prev?.status === 'logged' ? prev.photoUri : null,
    prevShared: prev?.shareFriends,
    shareFriends: input.shareFriends,
    photoBackup: settings.photoBackup,
  });
  trackMealPhoto(input.date, input.index, input.photoUri, action);
}

/** 하루 상세의 "수정": 저장된 끼니 하나를 읽는다. 기록된(logged) 끼니가 아니면 null. */
export function readLoggedMeal(date: string, index: number) {
  const row = db
    .select()
    .from(mealLogs)
    .where(and(eq(mealLogs.date, date), eq(mealLogs.index, index)))
    .get();
  return row && row.status === 'logged' ? row : null;
}

/** 그날 이미 기록한 끼니 번호들 (기타 번호를 고를 때) */
export function loggedIndexesOn(date: string): number[] {
  return db
    .select({ index: mealLogs.index, status: mealLogs.status })
    .from(mealLogs)
    .where(eq(mealLogs.date, date))
    .all()
    .filter((r) => r.status === 'logged')
    .map((r) => r.index);
}
