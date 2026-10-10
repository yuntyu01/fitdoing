import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { MealSlot } from '../domain/meals';
import type {
  Activity,
  ActivityInput,
  FastingWindow,
  FoodStyle,
  NutritionSettings,
  Sex,
} from '../domain/nutrition';
import type { Goal, TargetEntry, Targets } from '../domain/targets';

// 날짜는 기기 로컬 기준 'YYYY-MM-DD', 시각은 epoch ms, 하루 중 시각은 'HH:mm'.

export type Mode = 'mild' | 'normal' | 'spicy';
export type ThemeMode = 'system' | 'light' | 'dark';
export type { Activity, Goal, Sex };

export interface Settings {
  mode: Mode;
  goal: Goal;
  // 신체 정보. 모르면 null (예전 설정에는 없다) — 기본값을 실제 정보로 단정하지 않는다.
  sex: Sex | null;
  age: number | null; // 만 나이
  activity: Activity | null; // 사용자가 확인한 KDRI 신체활동단계
  activityInput: ActivityInput | null; // 단계를 고를 때 참고한 일상 활동·운동
  heightCm: number;
  weightKg: number;
  meals: MealSlot[];
  gym: {
    enabled: boolean;
    days: number[]; // 0=월 ... 6=일
    weeklyTarget: number; // 이번 주 몇 번 가면 달성인지 (1~7, 기본은 요일 수)
    arriveBy: string; // 도착 시간
    name: string;
    address: string;
    lat: number | null;
    lng: number | null;
    radiusM: number;
  };
  sleep: { enabled: boolean; bedTime: string; wakeTime: string };
  coupons: { rest: number; cheat: number };
  targets: Targets; // 적용한 최종 목표
  nutrition: NutritionSettings | null; // 목표를 계산한 원본 입력. null 이면 예전 방식(직접 저장한 목표 그대로)
  targetHistory: TargetEntry[]; // 날짜별 목표 (주간 그래프가 과거 날짜를 그때 목표로 본다)
  foodStyle: FoodStyle; // 음식 선택 방식 (영양 목표와 별개, 저장만)
  allergies: string[]; // 알레르기 (음식 선호와 별개, 저장만)
  fasting: FastingWindow | null; // 간헐적 단식 먹는 시간 (구조만, 화면 없음)
  allowedApps: string[];
  lockMinutes: number;
  emergencyPerWeek: number;
  photoBackup: boolean; // 켰을 때만 사진이 R2로 올라간다
  nickname: string; // 친구에게 보이는 이름 (20자 이하)
  themeMode: ThemeMode; // 화면 모드: 시스템 설정을 따르거나 밝게/어둡게 고정
  notifications: boolean; // 마감 알림 켜기/끄기
  shareFriends: boolean; // 새 끼니를 친구에게 공유하는 기본값
}

// 설정은 한 줄짜리 JSON으로 둔다. 잠금 엔진에는 setSchedule로 따로 넘긴다.
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  json: text('json', { mode: 'json' }).$type<Settings>().notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** 인식한 음식 하나. 칼로리·탄단지는 AI가 음식마다 추정한 값이고, 직접 입력한 음식은 없다(끼니 합계는 AiResult 쪽이 기준). */
export interface FoodItem {
  name: string;
  amount: string;
  kcal?: number | null;
  carbs?: number | null;
  protein?: number | null;
  fat?: number | null;
  /** 이 음식을 먹은 비율 (0.25·0.5·0.75·1·1.5·2, 없으면 1). 위 숫자는 음식 전체 기준, 끼니 합계에는 이미 반영돼 있다. */
  portion?: number | null;
}

export interface AiResult {
  items: FoodItem[];
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
    // 같은 끼니의 사진 2·3번째 (첫 장은 photoUri). 폰에만 둔다: 서버 사진 백업은 첫 장만.
    extraPhotoUris: text('extra_photo_uris', { mode: 'json' }).$type<string[]>(),
    barcode: text('barcode'),
    ai: text('ai', { mode: 'json' }).$type<AiResult>(),
    portion: real('portion').notNull().default(1), // 0.25, 0.5, 1, 1.5, 2
    sharedMeal: integer('shared_meal', { mode: 'boolean' }).notNull().default(false),
    shareFriends: integer('share_friends', { mode: 'boolean' }).notNull().default(false), // 친구에게 공유
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
  reason: text('reason'), // 비상 해제 사유 (선택)
});

export const couponUses = sqliteTable('coupon_uses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['rest', 'cheat', 'emergency'] }).notNull(),
  usedAt: integer('used_at').notNull(),
  weekKey: text('week_key').notNull(), // 월요일 시작 주의 월요일 날짜
});
