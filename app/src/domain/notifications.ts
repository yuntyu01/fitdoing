import { deadlinesFor, scheduleDay, type MealSlot } from './meals';
import { addDays, atMinutes, dateKey, fromMinutes, toMinutes, weekdayMon0 } from './time';

export const PRE_DEADLINE_MIN = 30;
// 헬스는 도착 시간만 받는다. 알림(나중엔 SNS 잠금)은 도착 1시간 전에 시작한다.
export const GYM_LEAD_MIN = 60;
export const HORIZON_DAYS = 7;

export type PlannedNotification =
  | { id: string; at: Date; kind: 'meal_pre'; meal: number; deadline: string }
  | { id: string; at: Date; kind: 'meal_due'; meal: number; deadline: string }
  | { id: string; at: Date; kind: 'gym_start'; arriveBy: string };

export interface NotificationInput {
  meals: MealSlot[];
  gym: { enabled: boolean; days: number[]; arriveBy: string };
}

export const mealKey = (date: string, index: number) => `${date}#${index}`;

/**
 * 앞으로 며칠치 알림을 날짜별 일회성으로 펼친다.
 * 매일 반복 알림을 쓰지 않는 이유: 이미 찍은 끼니의 알림만 골라 빼야 해서.
 * 앱이 열릴 때와 설정·기록이 바뀔 때마다 통째로 다시 예약한다.
 */
export function planNotifications(
  input: NotificationInput,
  now: Date,
  logged: Set<string>,
  days = HORIZON_DAYS,
): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const first = scheduleDay(input.meals, now);

  for (let i = 0; i < days; i++) {
    const day = addDays(first, i);
    for (const d of deadlinesFor(day, input.meals)) {
      if (logged.has(mealKey(d.date, d.index))) continue;
      const deadline = fromMinutes(d.at.getHours() * 60 + d.at.getMinutes());
      const pre = new Date(d.at.getTime() - PRE_DEADLINE_MIN * 60_000);
      out.push({ id: `meal-pre-${d.date}-${d.index}`, at: pre, kind: 'meal_pre', meal: d.index, deadline });
      out.push({ id: `meal-due-${d.date}-${d.index}`, at: d.at, kind: 'meal_due', meal: d.index, deadline });
    }

    if (input.gym.enabled && input.gym.days.includes(weekdayMon0(day))) {
      const at = atMinutes(day, toMinutes(input.gym.arriveBy) - GYM_LEAD_MIN);
      out.push({ id: `gym-${dateKey(day)}`, at, kind: 'gym_start', arriveBy: input.gym.arriveBy });
    }
  }

  return out.filter((n) => n.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
}
