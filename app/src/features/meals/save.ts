import * as Notifications from 'expo-notifications';
import { randomUUID } from 'expo-crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { mealLogs, type AiResult, type Settings } from '../../db/schema';
import { sanitizeAi, toMealBackup } from '../../domain/logging';
import { backupMeal } from '../api/client';
import { rescheduleNotifications } from '../notifications/schedule';
import { notifyMealLogged } from './hooks';
import { deleteStoredPhoto } from './photos';

export interface LogMealInput {
  date: string;
  index: number;
  deadline: string;
  photoUri: string | null; // 이미 문서 디렉터리에 저장된 경로
  barcode: string | null;
  ai: AiResult;
  portion: number;
  sharedMeal: boolean;
}

/**
 * 끼니를 로컬 SQLite에 기록한다(진실). 같은 날 같은 끼니가 있으면 덮어쓴다.
 * 그 뒤 알림 정리 → 잠금 해제 훅 → 서버 백업(best effort) 순으로 이어지며, 뒤쪽 실패는 기록에 영향이 없다.
 */
export async function logMeal(input: LogMealInput, settings: Settings): Promise<void> {
  const ai = sanitizeAi(input.ai);
  const loggedAt = Date.now();

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
    barcode: input.barcode,
    ai,
    portion: input.portion,
    sharedMeal: input.sharedMeal,
    loggedAt,
    status: 'logged' as const,
  };
  db.insert(mealLogs)
    .values(values)
    .onConflictDoUpdate({ target: [mealLogs.date, mealLogs.index], set: values })
    .run();

  if (prev?.photoUri && prev.photoUri !== input.photoUri) deleteStoredPhoto(prev.photoUri);

  // 찍은 끼니의 예약 알림을 빼고, 떠 있는 알림은 치운다.
  rescheduleNotifications(settings).catch((e) => console.warn('reschedule failed', e));
  Notifications.dismissAllNotificationsAsync().catch(() => {});

  void notifyMealLogged({ date: input.date, index: input.index, loggedAt });
  void backupMeal(toMealBackup({ ...values, ai }));
}
