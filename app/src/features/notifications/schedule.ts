import { and, eq, gte } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { db } from '../../db/client';
import { mealLogs, type Settings } from '../../db/schema';
import { scheduleDay } from '../../domain/meals';
import { mealKey, planNotifications, type PlannedNotification } from '../../domain/notifications';
import { dateKey } from '../../domain/time';
import i18n from '../../i18n';

const CHANNEL_ID = 'reminders';

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: i18n.t('notif.channel'),
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

function contentFor(n: PlannedNotification) {
  switch (n.kind) {
    case 'meal_pre':
      return {
        title: i18n.t('notif.mealPreTitle', { meal: n.meal }),
        body: i18n.t('notif.mealPreBody', { time: n.deadline }),
      };
    case 'meal_due':
      return {
        title: i18n.t('notif.mealDueTitle', { meal: n.meal }),
        body: i18n.t('notif.mealDueBody'),
      };
    case 'gym_start':
      return {
        title: i18n.t('notif.gymTitle'),
        body: i18n.t('notif.gymBody', { time: n.arriveBy }),
      };
  }
}

/** 예약된 알림을 모두 지우고 앞으로 7일치를 다시 건다. 찍은 끼니는 빠진다. */
export async function rescheduleNotifications(settings: Settings, now = new Date()) {
  // 설정에서 마감 알림을 끄면 예약된 알림을 모두 지우고 새로 잡지 않는다
  if (settings.notifications === false) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }
  const from = dateKey(scheduleDay(settings.meals, now));
  const logged = db
    .select({ date: mealLogs.date, index: mealLogs.index })
    .from(mealLogs)
    .where(and(gte(mealLogs.date, from), eq(mealLogs.status, 'logged')))
    .all();
  const plan = planNotifications(
    { meals: settings.meals, gym: settings.gym },
    now,
    new Set(logged.map((l) => mealKey(l.date, l.index))),
  );

  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: contentFor(n),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL_ID },
    });
  }
}
