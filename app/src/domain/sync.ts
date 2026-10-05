import type { Settings } from '../db/schema';
import type { MealBackup } from './logging';

// 서버 동기화의 순수 로직: 본문 만들기, 큐(중복 제거·상한), 보낼 요청 묶기, 보내기 루프.
// 이 파일은 RN·DB에 기대지 않는다(타입 import만). Node 스크립트(scripts/e2e-server.mjs)도 그대로 쓴다.

// ---- 본문 (docs/contract 와 같은 모양) ----

export type VerifiedBy = 'geofence' | 'photo' | 'rest';
export type LockKind = 'meal' | 'gym' | 'sleep';
export type ReleasedBy = 'action' | 'time' | 'emergency' | 'coupon';
export type CouponKind = 'rest' | 'cheat' | 'emergency';

export interface GymLogBody {
  date: string;
  verifiedBy: VerifiedBy;
  checkInAt: number | null;
}
export interface SleepLogBody {
  date: string;
  lockedAt: number | null;
  unlockedAt: number | null;
}
export interface LockEventBody {
  type: LockKind;
  date: string;
  startedAt: number;
  endedAt: number | null;
  releasedBy: ReleasedBy | null;
}
export interface CouponUseBody {
  type: CouponKind;
  usedAt: number;
  weekKey: string;
}
export interface SyncEventsBody {
  gymLogs: GymLogBody[];
  sleepLogs: SleepLogBody[];
  lockEvents: LockEventBody[];
  couponUses: CouponUseBody[];
}

/** PUT /api/sync/settings 본문. Settings에 있는 필드만, 계약과 같은 순서로. */
export function toSettingsBody(s: Settings): Settings {
  return {
    mode: s.mode,
    goal: s.goal,
    heightCm: s.heightCm,
    weightKg: s.weightKg,
    meals: s.meals.map((m) => ({ index: m.index, deadline: m.deadline })),
    gym: {
      enabled: s.gym.enabled,
      days: [...s.gym.days],
      arriveBy: s.gym.arriveBy,
      name: s.gym.name,
      address: s.gym.address,
      lat: s.gym.lat,
      lng: s.gym.lng,
      radiusM: s.gym.radiusM,
    },
    sleep: { enabled: s.sleep.enabled, bedTime: s.sleep.bedTime, wakeTime: s.sleep.wakeTime },
    coupons: { rest: s.coupons.rest, cheat: s.coupons.cheat },
    targets: { kcal: s.targets.kcal, carbs: s.targets.carbs, protein: s.targets.protein, fat: s.targets.fat },
    allowedApps: [...s.allowedApps],
    lockMinutes: s.lockMinutes,
    emergencyPerWeek: s.emergencyPerWeek,
    photoBackup: s.photoBackup,
  };
}

/** 기기 로컬 날짜 'YYYY-MM-DD' */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toGymLogBody(r: { date: string; checkInAt: number | null; verifiedBy: VerifiedBy | null }): GymLogBody | null {
  if (!r.verifiedBy) return null; // 인증 전 기록은 보내지 않는다
  return { date: r.date, verifiedBy: r.verifiedBy, checkInAt: r.checkInAt ?? null };
}
export function toSleepLogBody(r: { date: string; lockedAt: number | null; unlockedAt: number | null }): SleepLogBody {
  return { date: r.date, lockedAt: r.lockedAt ?? null, unlockedAt: r.unlockedAt ?? null };
}
export function toLockEventBody(r: {
  type: LockKind;
  startedAt: number;
  endedAt: number | null;
  releasedBy: ReleasedBy | null;
}): LockEventBody {
  return {
    type: r.type,
    date: localDateKey(r.startedAt),
    startedAt: r.startedAt,
    endedAt: r.endedAt ?? null,
    releasedBy: r.releasedBy ?? null,
  };
}
export function toCouponUseBody(r: { type: CouponKind; usedAt: number; weekKey: string }): CouponUseBody {
  return { type: r.type, usedAt: r.usedAt, weekKey: r.weekKey };
}

// ---- 큐 ----

export type EventItem =
  | { kind: 'event'; key: string; table: 'gymLogs'; body: GymLogBody }
  | { kind: 'event'; key: string; table: 'sleepLogs'; body: SleepLogBody }
  | { kind: 'event'; key: string; table: 'lockEvents'; body: LockEventBody }
  | { kind: 'event'; key: string; table: 'couponUses'; body: CouponUseBody };

export type QueueItem =
  | { kind: 'meal'; key: string; body: MealBackup }
  | { kind: 'settings'; key: 'settings'; body: unknown }
  | EventItem;

export const MAX_QUEUE = 500;
export const MAX_EVENTS_PER_REQUEST = 200;

export const mealQueueKey = (date: string, index: number) => `meal:${date}:${index}`;
export const gymItem = (b: GymLogBody): EventItem => ({ kind: 'event', key: `gym:${b.date}`, table: 'gymLogs', body: b });
export const sleepItem = (b: SleepLogBody): EventItem => ({ kind: 'event', key: `sleep:${b.date}`, table: 'sleepLogs', body: b });
export const lockItem = (b: LockEventBody): EventItem => ({
  kind: 'event',
  key: `lock:${b.type}:${b.startedAt}`,
  table: 'lockEvents',
  body: b,
});
export const couponItem = (b: CouponUseBody): EventItem => ({
  kind: 'event',
  key: `coupon:${b.type}:${b.usedAt}`,
  table: 'couponUses',
  body: b,
});

/**
 * 같은 key는 최신 값으로 덮어쓰고(자리는 맨 뒤), max를 넘으면 오래된 것부터 버린다.
 * 버린 개수(dropped)가 0보다 크면 호출한 쪽이 "전체 동기화 다시"로 만회한다 — 로컬 DB가 진실이라 어차피 다시 만들 수 있다.
 */
export function enqueue(queue: QueueItem[], item: QueueItem, max = MAX_QUEUE): { queue: QueueItem[]; dropped: number } {
  const next = [...queue.filter((q) => q.key !== item.key), item];
  const dropped = Math.max(0, next.length - max);
  return { queue: dropped > 0 ? next.slice(dropped) : next, dropped };
}

export function enqueueAll(queue: QueueItem[], items: QueueItem[], max = MAX_QUEUE): { queue: QueueItem[]; dropped: number } {
  let q = queue;
  let dropped = 0;
  for (const it of items) {
    const r = enqueue(q, it, max);
    q = r.queue;
    dropped += r.dropped;
  }
  return { queue: q, dropped };
}

// ---- 요청 계획 ----

export interface SyncRequest {
  method: 'POST' | 'PUT';
  path: string;
  body: unknown;
  items: QueueItem[];
}

export function eventsBody(items: EventItem[]): SyncEventsBody {
  const out: SyncEventsBody = { gymLogs: [], sleepLogs: [], lockEvents: [], couponUses: [] };
  for (const it of items) {
    if (it.table === 'gymLogs') out.gymLogs.push(it.body);
    else if (it.table === 'sleepLogs') out.sleepLogs.push(it.body);
    else if (it.table === 'lockEvents') out.lockEvents.push(it.body);
    else out.couponUses.push(it.body);
  }
  return out;
}

/** 설정 → 끼니 → (헬스·취침·잠금·쿠폰을 묶은) events 순으로 보낼 요청 목록. */
export function planRequests(queue: QueueItem[], maxEvents = MAX_EVENTS_PER_REQUEST): SyncRequest[] {
  const reqs: SyncRequest[] = [];
  for (const it of queue) {
    if (it.kind === 'settings') reqs.push({ method: 'PUT', path: '/api/sync/settings', body: it.body, items: [it] });
  }
  for (const it of queue) {
    if (it.kind === 'meal') reqs.push({ method: 'POST', path: '/api/meals', body: it.body, items: [it] });
  }
  const events = queue.filter((q): q is EventItem => q.kind === 'event');
  for (let i = 0; i < events.length; i += maxEvents) {
    const chunk = events.slice(i, i + maxEvents);
    reqs.push({ method: 'POST', path: '/api/sync/events', body: eventsBody(chunk), items: chunk });
  }
  return reqs;
}

// ---- 보내기 루프 ----

export type Outcome = 'ok' | 'drop' | 'retry';

/** HTTP 상태(없으면 네트워크 오류)를 큐 처리 결과로. 4xx는 다시 보내도 같아서 버리고, 나머지는 유지한다. */
export function classify(status: number | null): Outcome {
  if (status === null) return 'retry';
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 400 && status < 500) return 'drop';
  return 'retry';
}

export const itemSig = (it: QueueItem) => `${it.key}\u0000${JSON.stringify(it.body)}`;

/** 보내는 동안 같은 key가 새 값으로 덮어써졌다면 남겨야 하므로 key+본문이 같은 것만 뺀다. */
export function removeSent(queue: QueueItem[], sent: QueueItem[]): QueueItem[] {
  const sigs = new Set(sent.map(itemSig));
  return queue.filter((q) => !sigs.has(itemSig(q)));
}

export interface FlushIO {
  read(): Promise<QueueItem[]>;
  remove(items: QueueItem[]): Promise<void>;
  /** 응답 상태를 돌려준다. 네트워크 오류·타임아웃이면 throw 하거나 null. */
  send(req: SyncRequest): Promise<number | null>;
  warn?(msg: string, detail?: unknown): void;
}

export interface FlushResult {
  sent: number; // 서버가 받은 항목 수
  dropped: number; // 4xx로 버린 항목 수
  failed: boolean; // 네트워크·5xx로 멈췄다(큐에 남음)
}

async function sendOne(io: FlushIO, req: SyncRequest, res: FlushResult): Promise<boolean> {
  let status: number | null;
  try {
    status = await io.send(req);
  } catch {
    status = null;
  }
  const o = classify(status);
  if (o === 'ok') {
    await io.remove(req.items);
    res.sent += req.items.length;
    return true;
  }
  if (o === 'drop') {
    if (req.items.length > 1 && req.items[0].kind === 'event') {
      // 한 줄 때문에 묶음 전체가 거절됐을 수 있다. 하나씩 보내 나쁜 줄만 버린다.
      for (const it of req.items as EventItem[]) {
        const ok = await sendOne(io, { ...req, body: eventsBody([it]), items: [it] }, res);
        if (!ok) return false;
      }
      return true;
    }
    io.warn?.(`sync rejected (${status}) ${req.path}`, req.items.map((i) => i.key));
    await io.remove(req.items);
    res.dropped += req.items.length;
    return true;
  }
  res.failed = true;
  return false;
}

/** 큐를 계획대로 모두 보낸다. 서버·네트워크 문제가 나면 거기서 멈춘다. */
export async function drainQueue(io: FlushIO): Promise<FlushResult> {
  const res: FlushResult = { sent: 0, dropped: 0, failed: false };
  for (const req of planRequests(await io.read())) {
    if (!(await sendOne(io, req, res))) break;
  }
  return res;
}

/** 실패 횟수에 따른 다음 시도까지 대기(ms): 5초부터 두 배씩, 최대 5분. */
export function backoffMs(failures: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, failures - 1));
}

// ---- 초기 전체 동기화 ----

export interface LocalRows {
  settings: Settings | null;
  meals: {
    date: string;
    index: number;
    deadline: string;
    barcode: string | null;
    ai: MealBackup['ai'] | null;
    portion: number;
    sharedMeal: boolean;
    loggedAt: number | null;
    status: string;
  }[];
  gymLogs: { date: string; checkInAt: number | null; verifiedBy: VerifiedBy | null }[];
  sleepLogs: { date: string; lockedAt: number | null; unlockedAt: number | null }[];
  lockEvents: { type: LockKind; startedAt: number; endedAt: number | null; releasedBy: ReleasedBy | null }[];
  couponUses: { type: CouponKind; usedAt: number; weekKey: string }[];
}

/** 로컬에 이미 있는 기록 전체를 큐 항목으로. 기록된(logged) 끼니와 인증된 헬스만 올린다. */
export function initialSyncItems(
  rows: LocalRows,
  toMeal: (m: LocalRows['meals'][number]) => MealBackup,
): QueueItem[] {
  const items: QueueItem[] = [];
  if (rows.settings) items.push({ kind: 'settings', key: 'settings', body: toSettingsBody(rows.settings) });
  for (const m of rows.meals) {
    if (m.status !== 'logged' || !m.ai || m.loggedAt == null) continue;
    items.push({ kind: 'meal', key: mealQueueKey(m.date, m.index), body: toMeal(m) });
  }
  for (const g of rows.gymLogs) {
    const b = toGymLogBody(g);
    if (b) items.push(gymItem(b));
  }
  for (const s of rows.sleepLogs) items.push(sleepItem(toSleepLogBody(s)));
  for (const l of rows.lockEvents) items.push(lockItem(toLockEventBody(l)));
  for (const c of rows.couponUses) items.push(couponItem(toCouponUseBody(c)));
  return items;
}
