import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { MealSlot } from '../domain/meals';
import type { Goal, Targets } from '../domain/targets';

// 날짜는 기기 로컬 기준 'YYYY-MM-DD', 시각은 epoch ms, 하루 중 시각은 'HH:mm'.

export type Mode = 'mild' | 'normal' | 'spicy';
export type { Goal };

export interface Settings {
  mode: Mode;
  goal: Goal;
  heightCm: number;
  weightKg: number;
  meals: MealSlot[];
  gym: {
    enabled: boolean;
    days: number[]; // 0=월 ... 6=일
    arriveBy: string; // 도착 시간
    name: string;
    address: string;
    lat: number | null;
    lng: number | null;
    radiusM: number;
  };
  sleep: { enabled: boolean; bedTime: string; wakeTime: string };
  coupons: { rest: number; cheat: number };
  targets: Targets;
  allowedApps: string[];
  lockMinutes: number;
  emergencyPerWeek: number;
  photoBackup: boolean; // 켰을 때만 사진이 R2로 올라간다
}

// 설정은 한 줄짜리 JSON으로 둔다. 잠금 엔진에는 setSchedule로 따로 넘긴다.
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  json: text('json', { mode: 'json' }).$type<Settings>().notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export interface AiResult {
  items: { name: string; amount: string }[];
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  confidence: number;
}

export const mealLogs = sqliteTable(
  'meal_logs',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    index: integer('meal_index').notNull(),
    deadline: text('deadline').notNull(),
    photoUri: text('photo_uri'), // 기기 안 경로. 백업을 켜지 않으면 폰 밖으로 나가지 않는다.
    barcode: text('barcode'),
    ai: text('ai', { mode: 'json' }).$type<AiResult>(),
    portion: real('portion').notNull().default(1), // 0.25, 0.5, 1
    sharedMeal: integer('shared_meal', { mode: 'boolean' }).notNull().default(false),
    loggedAt: integer('logged_at'),
    status: text('status', { enum: ['pending', 'logged', 'overdue', 'locked'] })
      .notNull()
      .default('pending'),
  },
  (t) => [uniqueIndex('meal_logs_date_index').on(t.date, t.index)],
);

export const gymLogs = sqliteTable('gym_logs', {
  date: text('date').primaryKey(),
  checkInAt: integer('check_in_at'),
  checkOutAt: integer('check_out_at'),
  verifiedBy: text('verified_by', { enum: ['geofence', 'photo', 'rest'] }),
});

export const sleepLogs = sqliteTable('sleep_logs', {
  date: text('date').primaryKey(),
  lockedAt: integer('locked_at'),
  unlockedAt: integer('unlocked_at'),
});

export const lockEvents = sqliteTable('lock_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['meal', 'gym', 'sleep'] }).notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  releasedBy: text('released_by', { enum: ['action', 'time', 'emergency', 'coupon'] }),
});

export const couponUses = sqliteTable('coupon_uses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['rest', 'cheat', 'emergency'] }).notNull(),
  usedAt: integer('used_at').notNull(),
  weekKey: text('week_key').notNull(), // 월요일 시작 주의 월요일 날짜
});
