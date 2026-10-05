// 웹 스크린샷 전용 가짜 DB. docs/design/home.png 와 같은 상태(9월 26일 토요일 18:40)를 돌려준다.
// where 조건은 해석하지 않는다. 테이블별로 "오늘 화면에 필요한 행"만 시드해 둔다.
import { getTableName } from 'drizzle-orm';

import type { Settings } from '../db/schema';
import { resizeMeals } from '../domain/meals';

export const SEED_NOW = '2026-09-26T18:40:00+09:00';
const at = (h: number, m: number) => new Date(2026, 8, 26, h, m).getTime();

export const seedSettings: Settings = {
  mode: 'normal',
  goal: 'keep',
  heightCm: 175,
  weightKg: 70,
  meals: resizeMeals([], 4),
  gym: {
    enabled: true,
    days: [0, 2, 4, 5, 6],
    arriveBy: '19:00',
    name: '바디핏짐 성수점',
    address: '서울 성동구 연무장길 00',
    lat: 37.5446,
    lng: 127.0557,
    radiusM: 150,
  },
  sleep: { enabled: true, bedTime: '23:30', wakeTime: '07:00' },
  coupons: { rest: 2, cheat: 2 },
  targets: { kcal: 1600, carbs: 180, protein: 100, fat: 53 },
  allowedApps: [],
  lockMinutes: 120,
  emergencyPerWeek: 2,
  photoBackup: false,
};

const meal = (index: number, deadline: string, h: number, m: number, kcal: number, c: number, p: number, f: number) => ({
  id: `seed-${index}`,
  date: '2026-09-26',
  index,
  deadline,
  photoUri: null,
  barcode: null,
  ai: { items: [], kcal, carbs: c, protein: p, fat: f, confidence: 0.9 },
  portion: 1,
  sharedMeal: false,
  loggedAt: at(h, m),
  status: 'logged' as const,
});

const gym = (date: string) => ({ date, checkInAt: null, checkOutAt: null, verifiedBy: 'geofence' as const });

// 스크린샷 스크립트가 window.__FD_FRESH__ = true 를 심으면 온보딩 전(설정 없음) 상태가 된다.
const fresh = () => (globalThis as { __FD_FRESH__?: boolean }).__FD_FRESH__ === true;

const SEED: Record<string, unknown[]> = {
  get settings() {
    return fresh() ? [] : [{ id: 1, json: seedSettings, updatedAt: at(9, 0) }];
  },
  meal_logs: [
    meal(1, '08:00', 7, 48, 380, 35, 24, 16),
    meal(2, '14:00', 12, 18, 520, 60, 30, 18),
    meal(3, '17:00', 16, 5, 260, 28, 19, 8),
  ],
  gym_logs: [gym('2026-09-21'), gym('2026-09-23'), gym('2026-09-25')],
};
// "기록한 날" 점: 23~25일 (시안에는 오늘 점이 없다)
const LOGGED_DAYS = ['2026-09-23', '2026-09-24', '2026-09-25'].map((date) => ({ date }));

// 주간 그래프용: 지난주 전체 + 이번 주(수·목·금, 월·화는 기록 없음) + 오늘. 홈 점(23~25일)과 맞춘다.
const day = (date: string, kcal: number) => ({
  date,
  ai: { kcal, carbs: Math.round(kcal / 9), protein: Math.round(kcal / 16), fat: Math.round(kcal / 30) },
  portion: 1,
});
const WEEKLY: unknown[] = [
  ...[1700, 1650, 1560, 1620, 1760, 1790, 1690].map((k, i) => day(`2026-09-${14 + i}`, k)),
  day('2026-09-23', 1500),
  day('2026-09-24', 1850),
  day('2026-09-25', 1420),
  ...(SEED.meal_logs as { date: string; ai: unknown; portion: number }[]).map(({ date, ai, portion }) => ({ date, ai, portion })),
];

class Query {
  table = '';
  constructor(private distinct: boolean, private fields?: Record<string, unknown>) {}
  from(t: object) {
    this.table = getTableName(t as never);
    return this;
  }
  rows(): unknown[] {
    if (this.distinct && this.table === 'meal_logs') return LOGGED_DAYS;
    if (this.fields && 'ai' in this.fields && this.table === 'meal_logs') return WEEKLY; // useWeeklyRows
    return SEED[this.table] ?? [];
  }
  get() {
    return this.rows()[0];
  }
  all() {
    return this.rows();
  }
  run() {}
  then(resolve: (v: unknown[]) => unknown) {
    return Promise.resolve(this.rows()).then(resolve);
  }
}

// 알 수 없는 체이닝(where/orderBy/values/...)은 자기 자신을 돌려준다.
const chain = (q: Query) =>
  new Proxy(q, {
    get: (t, k, r) => (k in t ? Reflect.get(t, k, r) : () => r),
  });

export const fakeDb = {
  select: (fields?: Record<string, unknown>) => chain(new Query(false, fields)),
  selectDistinct: () => chain(new Query(true)),
  insert: () => chain(new Query(false)),
  update: () => chain(new Query(false)),
  delete: () => chain(new Query(false)),
};
