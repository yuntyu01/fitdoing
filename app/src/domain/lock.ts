import { deadlinesFor } from './meals';
import { mealKey } from './notifications';
import { addDays, atMinutes, dateKey, startOfDay, toMinutes, weekdayMon0 } from './time';

// 잠금 판정. 순수 함수만 둔다. 네트워크·DB·시계에 기대지 않는다.
//
// 절대 규칙: 칼로리·영양 숫자는 이 모듈의 입력에 없다. 칼로리 초과로는 잠금이 나올 수 없다.

export type LockType = 'meal' | 'gym' | 'sleep';
export type ReleaseBy = 'action' | 'time' | 'emergency' | 'coupon';
export type LockMode = 'mild' | 'normal' | 'spicy';
export type LockReason = 'meal_missed' | 'gym_not_arrived' | 'sleep_time';

/** 잠금 판정에 쓰는 설정. 앱 Settings의 일부와 구조가 같다. */
export interface LockSettings {
  mode: LockMode;
  meals: { index: number; deadline: string }[];
  gym: { enabled: boolean; days: number[]; arriveBy: string };
  sleep: { enabled: boolean; bedTime: string; wakeTime: string };
  lockMinutes: number;
}

export interface LockSnapshot {
  now: Date;
  settings: LockSettings;
  /** 기록한 끼니. mealKey(날짜, 번호) */
  loggedMeals: Set<string>;
  /** 헬스 도착(지오펜스·사진·휴식권)을 확인한 날짜 'YYYY-MM-DD' */
  gymDoneDates: Set<string>;
  /** 이미 풀린 잠금. lockKey(type, startedAt) */
  released: Set<string>;
  /** 이 시각보다 먼저 시작했을 잠금은 걸지 않는다. 설정을 막 바꾸거나 처음 설치한 직후의 소급 잠금을 막는다. */
  notBefore?: number;
}

export interface ActiveLock {
  type: LockType;
  reason: LockReason;
  /** 잠금이 시작된 시각(epoch ms). 같은 잠금은 언제 계산해도 같은 값이라 기록과 대조할 수 있다. */
  startedAt: number;
  /** 시간으로 풀리는 시각(epoch ms) */
  until: number;
  /** 끼니 잠금일 때 가장 최근에 놓친 끼니 번호 */
  meal?: number;
  /** 지금 함께 걸려 있는 같은 종류 잠금의 startedAt 전부 (겹친 끼니). 풀 때 한꺼번에 푼다. */
  covers: number[];
}

export interface LockDecision {
  /** 지금 걸어야 하는 잠금 */
  lock: ActiveLock | null;
  /** 순한맛이라 잠금 대신 알림만 하는 경우, 걸렸을 잠금 */
  notifyOnly: ActiveLock | null;
}

/** 취침 > 헬스 > 끼니 */
export const LOCK_PRIORITY: LockType[] = ['sleep', 'gym', 'meal'];

export const lockKey = (type: LockType, startedAt: number) => `${type}@${startedAt}`;

/** 잠금 시작 시각 기준으로 시간으로 풀리는 시각 */
export function naturalEnd(
  type: LockType,
  startedAt: number,
  s: Pick<LockSettings, 'lockMinutes' | 'sleep'>,
): number {
  const start = new Date(startedAt);
  switch (type) {
    case 'meal':
      return startedAt + Math.max(0, s.lockMinutes) * 60_000;
    case 'gym':
      return addDays(startOfDay(start), 1).getTime();
    case 'sleep': {
      const b = toMinutes(s.sleep.bedTime);
      const w = toMinutes(s.sleep.wakeTime);
      return atMinutes(startOfDay(start), w <= b ? w + 1440 : w).getTime();
    }
  }
}

function mealCandidates(s: LockSnapshot): ActiveLock[] {
  const { now, settings } = s;
  const nowMs = now.getTime();
  const out: ActiveLock[] = [];
  const today = startOfDay(now);
  for (const day of [addDays(today, -1), today]) {
    for (const d of deadlinesFor(day, settings.meals)) {
      const startedAt = d.at.getTime();
      if (startedAt > nowMs) continue;
      if (s.loggedMeals.has(mealKey(d.date, d.index))) continue;
      const until = naturalEnd('meal', startedAt, settings);
      if (until <= nowMs) continue;
      out.push({ type: 'meal', reason: 'meal_missed', startedAt, until, meal: d.index, covers: [] });
    }
  }
  return out;
}

function gymCandidates(s: LockSnapshot): ActiveLock[] {
  const { now, settings } = s;
  const { gym } = settings;
  if (!gym.enabled) return [];
  const today = startOfDay(now);
  if (!gym.days.includes(weekdayMon0(today))) return [];
  if (s.gymDoneDates.has(dateKey(today))) return [];
  const startedAt = atMinutes(today, toMinutes(gym.arriveBy)).getTime();
  const until = naturalEnd('gym', startedAt, settings);
  if (startedAt > now.getTime() || until <= now.getTime()) return [];
  return [{ type: 'gym', reason: 'gym_not_arrived', startedAt, until, covers: [] }];
}

function sleepCandidates(s: LockSnapshot): ActiveLock[] {
  const { now, settings } = s;
  if (!settings.sleep.enabled) return [];
  const b = toMinutes(settings.sleep.bedTime);
  const w = toMinutes(settings.sleep.wakeTime);
  if (b === w) return [];
  const today = startOfDay(now);
  const out: ActiveLock[] = [];
  for (const day of [addDays(today, -1), today]) {
    const startedAt = atMinutes(day, b).getTime();
    const until = naturalEnd('sleep', startedAt, settings);
    if (startedAt <= now.getTime() && now.getTime() < until) {
      out.push({ type: 'sleep', reason: 'sleep_time', startedAt, until, covers: [] });
    }
  }
  return out;
}

/** 모드와 상관없이 지금 걸려야 하는 잠금 전부. 같은 종류 안에서 풀리지 않은 것만. */
export function activeLocks(s: LockSnapshot): ActiveLock[] {
  const all = [...sleepCandidates(s), ...gymCandidates(s), ...mealCandidates(s)].filter(
    (l) => !s.released.has(lockKey(l.type, l.startedAt)) && (s.notBefore === undefined || l.startedAt >= s.notBefore),
  );
  const out: ActiveLock[] = [];
  for (const type of LOCK_PRIORITY) {
    const same = all.filter((l) => l.type === type);
    if (same.length === 0) continue;
    // 가장 늦게 시작한(가장 최근 마감) 것을 보여준다. 끝나는 시각도 그쪽을 따른다.
    const top = same.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));
    out.push({ ...top, covers: same.map((l) => l.startedAt) });
  }
  return out;
}

/** 지금 걸려야 할 잠금 하나. 순한맛이면 걸지 않고 notifyOnly로만 알린다. */
export function decideLock(s: LockSnapshot): LockDecision {
  const top = activeLocks(s)[0] ?? null;
  if (!top) return { lock: null, notifyOnly: null };
  if (s.settings.mode === 'mild') return { lock: null, notifyOnly: top };
  return { lock: top, notifyOnly: null };
}

/** 풀 수 있는 방법. 'time'은 늘 포함(자동). 취침은 시간으로만 풀린다. */
export function releaseMethods(type: LockType, mode: LockMode): ReleaseBy[] {
  switch (type) {
    case 'meal':
      return mode === 'spicy' ? ['action', 'emergency', 'coupon', 'time'] : ['action', 'emergency', 'time'];
    case 'gym':
      return ['action', 'coupon', 'time'];
    case 'sleep':
      return ['time'];
  }
}

export function emergencyLeft(perWeek: number, usedThisWeek: number): number {
  return Math.max(0, perWeek - usedThisWeek);
}

// ---- 5초 대기 (비상 해제 · 휴식권) ----

export const HOLD_MS = 5000;
export type HoldKind = 'emergency' | 'coupon';

export type HoldState =
  | { phase: 'idle' }
  | { phase: 'waiting'; kind: HoldKind; startedAt: number }
  | { phase: 'ready'; kind: HoldKind; startedAt: number };

export const HOLD_IDLE: HoldState = { phase: 'idle' };

export function holdStart(kind: HoldKind, nowMs: number): HoldState {
  return { phase: 'waiting', kind, startedAt: nowMs };
}

export function holdCancel(): HoldState {
  return HOLD_IDLE;
}

/** 시간이 흐르면 waiting -> ready */
export function holdTick(state: HoldState, nowMs: number): HoldState {
  if (state.phase === 'waiting' && nowMs - state.startedAt >= HOLD_MS) {
    return { phase: 'ready', kind: state.kind, startedAt: state.startedAt };
  }
  return state;
}

/** 확정. 5초가 지난 뒤에만 confirmed. 아니면 상태 그대로. */
export function holdConfirm(
  state: HoldState,
  nowMs: number,
): { state: HoldState; confirmed: HoldKind | null } {
  const t = holdTick(state, nowMs);
  if (t.phase === 'ready') return { state: HOLD_IDLE, confirmed: t.kind };
  return { state: t, confirmed: null };
}

/** 남은 대기 초 (올림). 대기 중이 아니면 0 */
export function holdRemainingSec(state: HoldState, nowMs: number): number {
  if (state.phase !== 'waiting') return 0;
  return Math.max(0, Math.ceil((HOLD_MS - (nowMs - state.startedAt)) / 1000));
}

// ---- 항상 허용 앱 ----

/** 잠금 중에도 열리는 앱: 전화·문자·지도·알람·카카오톡·본 앱. 제조사별 패키지를 넉넉히 둔다. */
export const ALWAYS_ALLOWED_PACKAGES = [
  'com.fitdoing.app',
  'com.android.dialer',
  'com.google.android.dialer',
  'com.samsung.android.dialer',
  'com.android.server.telecom',
  'com.android.mms',
  'com.google.android.apps.messaging',
  'com.samsung.android.messaging',
  'com.google.android.apps.maps',
  'com.kakao.talk',
  'com.android.deskclock',
  'com.google.android.deskclock',
  'com.sec.android.app.clockpackage',
  'com.android.systemui',
];

export function allowedPackages(userApps: string[]): string[] {
  return Array.from(new Set([...ALWAYS_ALLOWED_PACKAGES, ...userApps]));
}

// ---- 표시용 ----

/** 남은 ms -> 'H:MM:SS'. 음수는 0. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
