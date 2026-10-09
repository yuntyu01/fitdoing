import type { Settings } from '../../db/schema';
import { resizeMeals } from '../../domain/meals';
import { defaultTargets } from '../../domain/targets';

/** 온보딩 첫 화면의 초기값. 시안과 같은 값으로 시작한다. */
export function initialSettings(): Settings {
  return {
    mode: 'normal',
    goal: 'keep',
    heightCm: 175,
    weightKg: 70,
    meals: resizeMeals([], 4),
    gym: {
      enabled: true,
      days: [0, 1, 2, 3, 4],
      weeklyTarget: 5,
      arriveBy: '19:00',
      name: '',
      address: '',
      lat: null,
      lng: null,
      radiusM: 150,
    },
    sleep: { enabled: true, bedTime: '23:30', wakeTime: '07:00' },
    coupons: { rest: 2, cheat: 2 },
    targets: defaultTargets('keep', 70),
    allowedApps: [],
    lockMinutes: 120,
    emergencyPerWeek: 2,
    photoBackup: false,
    nickname: '',
    themeMode: 'system',
    notifications: true,
    shareFriends: false,
  };
}
