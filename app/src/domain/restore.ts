import { sanitizeItem } from './logging';
import type { AiResult, FoodItem, Settings } from '../db/schema';
import type {
  CouponKind,
  CouponUseBody,
  GymLogBody,
  LockEventBody,
  LockKind,
  ReleasedBy,
  SleepLogBody,
  VerifiedBy,
} from './sync';

// 서버 스냅샷(GET /api/sync/snapshot) → 로컬 DB 행. sync.ts 의 toXxxBody 의 반대 방향이다.
// 순수 함수만 둔다(DB·RN 없음). 모양이 어긋난 행은 버려서 복원이 통째로 실패하지 않게 한다.

/** 스냅샷의 끼니. nutrition은 먹은 만큼(portion·나눔 반영)으로 반올림돼 있고, base는 저장된 1인분 원본이다. */
export interface MealView {
  id: string;
  date: string;
  index: number;
  deadline: string;
  barcode: string | null;
  items: FoodItem[];
  nutrition: { kcal: number; carbs: number; protein: number; fat: number };
  base?: { kcal: number; carbs: number; protein: number; fat: number }; // 예전 서버에는 없다
  portion: number;
  sharedMeal: boolean;
  shareFriends?: boolean;
  cheat: boolean;
  confidence: number;
  loggedAt: string; // ISO
}

export interface Snapshot {
  settings: unknown | null;
  meals: MealView[];
  gymLogs: GymLogBody[];
  sleepLogs: SleepLogBody[];
  lockEvents: LockEventBody[];
  couponUses: CouponUseBody[];
  /** 사진을 백업해 둔 끼니 (사진 백업을 켠 사람만). 옛 서버에는 없다. */
  photos?: { date: string; index: number }[];
}

export interface RestoredMeal {
  id: string;
  date: string;
  index: number;
  deadline: string;
  photoUri: null; // 사진은 서버로 올리지 않았으므로 복원할 수 없다
  barcode: string | null;
  ai: AiResult;
  portion: number;
  sharedMeal: boolean;
  shareFriends: boolean;
  loggedAt: number;
  status: 'logged';
}
export interface RestoredGym {
  date: string;
  checkInAt: number | null;
  checkOutAt: null;
  verifiedBy: VerifiedBy;
}
export interface RestoredSleep {
  date: string;
  lockedAt: number | null;
  unlockedAt: number | null;
}
export interface RestoredLock {
  type: LockKind;
  startedAt: number;
  endedAt: number | null;
  releasedBy: ReleasedBy | null;
  reason: string | null;
}
export interface RestoredCoupon {
  type: CouponKind;
  usedAt: number;
  weekKey: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;

const MODES = ['mild', 'normal', 'spicy'] as const;
const GOALS = ['lose', 'keep', 'gain'] as const;
const VERIFIED = ['geofence', 'photo', 'rest'] as const;
const LOCK_KINDS = ['meal', 'gym', 'sleep'] as const;
const RELEASED = ['action', 'time', 'emergency', 'coupon'] as const;
const COUPON_KINDS = ['rest', 'cheat', 'emergency'] as const;
const THEME_MODES = ['system', 'light', 'dark'] as const;

/** 서버 설정 JSON → 로컬 Settings. 빠졌거나 null 인 부분은 defaults 값으로 채운다. */
export function fromSettingsBody(raw: unknown, defaults: Settings): Settings {
  const b: Obj = isObj(raw) ? raw : {};
  const g: Obj = isObj(b.gym) ? b.gym : {};
  const sl: Obj = isObj(b.sleep) ? b.sleep : {};
  const c: Obj = isObj(b.coupons) ? b.coupons : {};
  const t: Obj = isObj(b.targets) ? b.targets : {};
  const meals = Array.isArray(b.meals)
    ? b.meals
        .filter(isObj)
        .map((m) => ({ index: num(m.index, 0), deadline: str(m.deadline, '') }))
        .filter((m) => m.index > 0 && m.deadline !== '')
    : [];
  const out: Settings = {
    mode: oneOf(b.mode, MODES) ?? defaults.mode,
    goal: oneOf(b.goal, GOALS) ?? defaults.goal,
    heightCm: num(b.heightCm, defaults.heightCm),
    weightKg: num(b.weightKg, defaults.weightKg),
    meals: meals.length > 0 ? meals : defaults.meals.map((m) => ({ ...m })),
    gym: {
      enabled: bool(g.enabled, defaults.gym.enabled),
      days: Array.isArray(g.days) ? g.days.filter((d): d is number => typeof d === 'number') : [...defaults.gym.days],
      weeklyTarget: 0, // 아래에서 요일 수로 채운다
      arriveBy: str(g.arriveBy, defaults.gym.arriveBy),
      name: str(g.name, ''),
      address: str(g.address, ''),
      lat: numOrNull(g.lat),
      lng: numOrNull(g.lng),
      radiusM: num(g.radiusM, defaults.gym.radiusM),
    },
    sleep: {
      enabled: bool(sl.enabled, defaults.sleep.enabled),
      bedTime: str(sl.bedTime, defaults.sleep.bedTime),
      wakeTime: str(sl.wakeTime, defaults.sleep.wakeTime),
    },
    coupons: { rest: num(c.rest, defaults.coupons.rest), cheat: num(c.cheat, defaults.coupons.cheat) },
    targets: {
      kcal: num(t.kcal, defaults.targets.kcal),
      carbs: num(t.carbs, defaults.targets.carbs),
      protein: num(t.protein, defaults.targets.protein),
      fat: num(t.fat, defaults.targets.fat),
    },
    allowedApps: Array.isArray(b.allowedApps) ? b.allowedApps.filter((a): a is string => typeof a === 'string') : [],
    lockMinutes: num(b.lockMinutes, defaults.lockMinutes),
    emergencyPerWeek: num(b.emergencyPerWeek, defaults.emergencyPerWeek),
    photoBackup: bool(b.photoBackup, defaults.photoBackup),
    nickname: str(b.nickname, defaults.nickname),
    themeMode: oneOf(b.themeMode, THEME_MODES) ?? defaults.themeMode,
    notifications: bool(b.notifications, defaults.notifications),
    shareFriends: bool(b.shareFriends, defaults.shareFriends),
  };
  // 주간 목표가 없던 서버·앱: 고른 요일 수가 곧 목표
  const wt = num(g.weeklyTarget, 0);
  out.gym.weeklyTarget = wt >= 1 && wt <= 7 ? wt : Math.max(1, out.gym.days.length);
  return out;
}

/**
 * 서버 끼니 → 로컬 끼니. 서버가 base(저장된 1인분 원본)를 주면 그대로 쓴다.
 * base가 없는 서버면 nutrition(먹은 만큼, portion × 나눔 0.5 반영)을 그 비율로 나눠 되돌린다. 이 경우는 근사치다.
 */
export function fromMealView(m: MealView): RestoredMeal | null {
  if (!m.date || !(m.index > 0)) return null;
  const portion = m.portion > 0 ? m.portion : 1;
  const factor = portion * (m.sharedMeal ? 0.5 : 1);
  const scaleBack = (v: number) => Math.round(num(v, 0) / factor);
  const n = m.base ?? m.nutrition ?? { kcal: 0, carbs: 0, protein: 0, fat: 0 };
  const back = m.base ? (v: number) => Math.round(num(v, 0)) : scaleBack;
  const at = Date.parse(m.loggedAt);
  return {
    id: m.id,
    date: m.date,
    index: m.index,
    deadline: m.deadline,
    photoUri: null,
    barcode: m.barcode ?? null,
    ai: {
      items: (m.items ?? []).map(sanitizeItem),
      kcal: back(n.kcal),
      carbs: back(n.carbs),
      protein: back(n.protein),
      fat: back(n.fat),
      confidence: num(m.confidence, 0),
    },
    portion,
    sharedMeal: m.sharedMeal === true,
    shareFriends: m.shareFriends === true,
    loggedAt: Number.isFinite(at) ? at : Date.now(),
    status: 'logged',
  };
}

export function fromGymLogBody(b: GymLogBody): RestoredGym | null {
  const verifiedBy = oneOf(b.verifiedBy, VERIFIED);
  if (!b.date || !verifiedBy) return null;
  return { date: b.date, checkInAt: numOrNull(b.checkInAt), checkOutAt: null, verifiedBy };
}

export function fromSleepLogBody(b: SleepLogBody): RestoredSleep | null {
  if (!b.date) return null;
  return { date: b.date, lockedAt: numOrNull(b.lockedAt), unlockedAt: numOrNull(b.unlockedAt) };
}

export function fromLockEventBody(b: LockEventBody): RestoredLock | null {
  const type = oneOf(b.type, LOCK_KINDS);
  const startedAt = numOrNull(b.startedAt);
  if (!type || startedAt === null) return null;
  return {
    type,
    startedAt,
    endedAt: numOrNull(b.endedAt),
    releasedBy: oneOf(b.releasedBy, RELEASED),
    reason: typeof b.reason === 'string' && b.reason !== '' ? b.reason : null,
  };
}

export function fromCouponUseBody(b: CouponUseBody): RestoredCoupon | null {
  const type = oneOf(b.type, COUPON_KINDS);
  const usedAt = numOrNull(b.usedAt);
  if (!type || usedAt === null || !b.weekKey) return null;
  return { type, usedAt, weekKey: b.weekKey };
}

const compact = <T>(rows: (T | null)[]): T[] => rows.filter((r): r is T => r !== null);

export interface RestoredRows {
  settings: Settings | null;
  meals: RestoredMeal[];
  gymLogs: RestoredGym[];
  sleepLogs: RestoredSleep[];
  lockEvents: RestoredLock[];
  couponUses: RestoredCoupon[];
}

/** 스냅샷 전체를 로컬 행으로. 배열이 빠져 있어도(오래된 서버) 빈 배열로 본다. */
export function snapshotToRows(s: Snapshot, defaults: Settings): RestoredRows {
  return {
    settings: s.settings ? fromSettingsBody(s.settings, defaults) : null,
    meals: compact((s.meals ?? []).map(fromMealView)),
    gymLogs: compact((s.gymLogs ?? []).map(fromGymLogBody)),
    sleepLogs: compact((s.sleepLogs ?? []).map(fromSleepLogBody)),
    lockEvents: compact((s.lockEvents ?? []).map(fromLockEventBody)),
    couponUses: compact((s.couponUses ?? []).map(fromCouponUseBody)),
  };
}
