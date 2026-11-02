import type { Settings } from '../../db/schema';
import { rescheduleNotifications } from './schedule';

// 예약 저장소를 흉내 낸다. 진짜처럼 호출마다 비동기로 끝나서, 겹친 호출이 서로 끼어든다.
const mockScheduled = new Map<string, Date>();
const mockTick = () => new Promise((r) => setTimeout(r, 0));

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  cancelAllScheduledNotificationsAsync: async () => {
    await mockTick();
    mockScheduled.clear();
  },
  scheduleNotificationAsync: async (req: { identifier: string; trigger: { date: Date } }) => {
    await mockTick();
    mockScheduled.set(req.identifier, req.trigger.date);
  },
}));
jest.mock('../../db/client', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) },
}));
jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

const base = {
  notifications: true,
  meals: [{ index: 1, deadline: '12:00' }],
  gym: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], arriveBy: '19:00' },
  sleep: { enabled: false, bedTime: '23:30' },
} as unknown as Settings;

const now = new Date(2026, 8, 26, 9, 0);

beforeEach(() => mockScheduled.clear());

describe('rescheduleNotifications', () => {
  it('예약하는 중에 알림을 꺼도 남는 예약이 없다', async () => {
    await Promise.all([
      rescheduleNotifications(base, now),
      rescheduleNotifications({ ...base, notifications: false }, now),
    ]);
    expect([...mockScheduled.keys()]).toEqual([]);
  });

  it('겹쳐 부르면 마지막 설정대로만 남는다', async () => {
    const gymOff = { ...base, gym: { ...base.gym, enabled: false } } as Settings;
    await Promise.all([rescheduleNotifications(base, now), rescheduleNotifications(gymOff, now)]);
    const ids = [...mockScheduled.keys()];
    expect(ids.some((id) => id.startsWith('gym-'))).toBe(false);
    expect(ids.some((id) => id.startsWith('meal-due-'))).toBe(true);
  });

  it('앞 호출이 실패해도 뒤 호출은 돈다', async () => {
    const broken = { ...base, meals: null } as unknown as Settings;
    await expect(rescheduleNotifications(broken, now)).rejects.toBeDefined();
    await rescheduleNotifications(base, now);
    expect(mockScheduled.size).toBeGreaterThan(0);
  });
});
