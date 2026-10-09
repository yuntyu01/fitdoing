import type { Settings } from '../db/schema';
import { toMealBackup } from './logging';
import {
  backoffMs,
  classify,
  couponItem,
  drainQueue,
  enqueue,
  enqueueAll,
  eventsBody,
  gymItem,
  initialSyncItems,
  localDateKey,
  lockItem,
  mealQueueKey,
  PHOTO_WIPE,
  photoItem,
  planRequests,
  removeSent,
  sleepItem,
  toCouponUseBody,
  toGymLogBody,
  toLockEventBody,
  toSettingsBody,
  toSleepLogBody,
  type EventItem,
  type FlushIO,
  type QueueItem,
  type SyncEventsBody,
  type SyncRequest,
} from './sync';

// 테스트 전용: node 타입 없이 파일을 읽는다.
declare const require: (m: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');
const contract = <T>(name: string): T =>
  JSON.parse(readFileSync(join(__dirname, '../../../docs/contract', name), 'utf8'));
const settingsJson = contract<Settings>('settings.json');
const mealJson = contract<ReturnType<typeof toMealBackup>>('meal.json');
const eventsJson = contract<SyncEventsBody>('sync-events.json');

// 키 집합·타입이 같은지(재귀). 배열은 첫 원소 기준.
function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.length ? [shape(v[0])] : [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return v === null ? 'null' : typeof v;
}

describe('계약: settings', () => {
  it('예제 설정을 넣으면 예제와 같다', () => {
    expect(toSettingsBody(settingsJson)).toEqual(settingsJson);
  });
  it('Settings에 없는 필드는 보내지 않는다', () => {
    const body = toSettingsBody({
      ...settingsJson,
      extra: 1,
      gym: { ...settingsJson.gym, junk: 1 },
    } as unknown as Settings);
    expect(Object.keys(body)).toEqual(Object.keys(settingsJson));
    expect(Object.keys(body.gym)).toEqual(Object.keys(settingsJson.gym));
  });
});

describe('계약: meal', () => {
  it('같은 입력이면 예제와 같다', () => {
    const body = toMealBackup({
      date: mealJson.date,
      index: mealJson.index,
      deadline: mealJson.deadline,
      barcode: mealJson.barcode,
      ai: mealJson.ai,
      portion: mealJson.portion,
      sharedMeal: mealJson.sharedMeal,
      loggedAt: Date.parse(mealJson.loggedAt),
    });
    expect(body).toEqual(mealJson);
    expect(shape(body)).toEqual(shape(mealJson));
  });
});

describe('계약: sync events', () => {
  const items = (): EventItem[] => [
    ...eventsJson.gymLogs.map((r) => gymItem(toGymLogBody(r)!)),
    ...eventsJson.sleepLogs.map((r) => sleepItem(toSleepLogBody(r))),
    ...eventsJson.lockEvents.map((r) => lockItem({ ...toLockEventBody(r), date: r.date })),
    ...eventsJson.couponUses.map((r) => couponItem(toCouponUseBody(r))),
  ];
  it('예제 행으로 만든 묶음이 예제와 같다', () => {
    expect(eventsBody(items())).toEqual(eventsJson);
  });
  it('lock date 는 시작 시각의 로컬 날짜', () => {
    const t = new Date(2026, 8, 24, 10, 0).getTime();
    expect(toLockEventBody({ type: 'meal', startedAt: t, endedAt: null, releasedBy: null }).date).toBe('2026-09-24');
    expect(localDateKey(t)).toBe('2026-09-24');
  });
  it('인증 전 헬스 기록은 보내지 않는다', () => {
    expect(toGymLogBody({ date: 'd', checkInAt: null, verifiedBy: null })).toBeNull();
  });
});

const meal = (i: number, kcal = 1): QueueItem => ({
  kind: 'meal',
  key: mealQueueKey('d', i),
  body: toMealBackup({
    date: 'd',
    index: i,
    deadline: '08:00',
    barcode: null,
    ai: { items: [], kcal, carbs: 0, protein: 0, fat: 0, confidence: 0 },
    portion: 1,
    sharedMeal: false,
    loggedAt: 0,
  }),
});
const gym = (date: string, by: 'geofence' | 'rest' = 'geofence') => gymItem({ date, verifiedBy: by, checkInAt: null });

describe('enqueue', () => {
  it('같은 key는 최신으로 덮어쓴다', () => {
    const q = enqueue(enqueue([], meal(1, 1)).queue, meal(1, 2)).queue;
    expect(q).toHaveLength(1);
    expect(q[0].kind === 'meal' && q[0].body.ai.kcal).toBe(2);
  });
  it('key 규칙: gym:날짜, sleep:날짜, lock:type:startedAt, coupon:type:usedAt', () => {
    expect(gym('2026-09-25').key).toBe('gym:2026-09-25');
    expect(sleepItem({ date: 'd', lockedAt: 1, unlockedAt: null }).key).toBe('sleep:d');
    expect(lockItem({ type: 'meal', date: 'd', startedAt: 5, endedAt: null, releasedBy: null, reason: null }).key).toBe(
      'lock:meal:5',
    );
    expect(couponItem({ type: 'rest', usedAt: 7, weekKey: 'w' }).key).toBe('coupon:rest:7');
  });
  it('상한을 넘기면 오래된 것부터 버리고 개수를 알려준다', () => {
    let q: QueueItem[] = [];
    let dropped = 0;
    for (let i = 1; i <= 5; i++) {
      const r = enqueue(q, meal(i), 3);
      q = r.queue;
      dropped += r.dropped;
    }
    expect(q.map((x) => x.key)).toEqual([mealQueueKey('d', 3), mealQueueKey('d', 4), mealQueueKey('d', 5)]);
    expect(dropped).toBe(2);
    expect(enqueueAll([], [meal(1), meal(2)], 1).dropped).toBe(1);
  });
});

describe('planRequests', () => {
  const settingsItem: QueueItem = { kind: 'settings', key: 'settings', body: { a: 1 } };
  it('설정 → 끼니 → 이벤트 한 묶음 순서', () => {
    const q = [gym('d1'), meal(1), settingsItem, gym('d2'), meal(2)];
    const reqs = planRequests(q);
    expect(reqs.map((r) => `${r.method} ${r.path}`)).toEqual([
      'PUT /api/sync/settings',
      'POST /api/meals',
      'POST /api/meals',
      'POST /api/sync/events',
    ]);
    expect((reqs[3].body as SyncEventsBody).gymLogs).toHaveLength(2);
  });
  it('이벤트가 많으면 상한 단위로 자른다', () => {
    const q = [gym('a'), gym('b'), gym('c')];
    expect(planRequests(q, 2).map((r) => r.items.length)).toEqual([2, 1]);
  });
  it('비어 있으면 요청이 없다', () => {
    expect(planRequests([])).toEqual([]);
  });
});

describe('classify / backoff', () => {
  it('2xx 완료, 4xx 폐기, 5xx·네트워크 유지', () => {
    expect(classify(200)).toBe('ok');
    expect(classify(204)).toBe('ok');
    expect(classify(400)).toBe('drop');
    expect(classify(422)).toBe('drop');
    expect(classify(500)).toBe('retry');
    expect(classify(503)).toBe('retry');
    expect(classify(null)).toBe('retry');
  });
  it('401은 버리지 않고 멈춘다(로그인이 필요하다는 뜻)', () => {
    expect(classify(401)).toBe('unauth');
    expect(classify(403)).toBe('drop');
  });
  it('백오프는 두 배씩 늘고 5분에서 멈춘다', () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([5000, 10000, 20000]);
    expect(backoffMs(99)).toBe(300000);
  });
});

function makeIO(initial: QueueItem[], statusFor: (r: SyncRequest) => number | null) {
  let queue = initial;
  const sent: SyncRequest[] = [];
  const warn = jest.fn();
  const io: FlushIO = {
    read: async () => queue,
    remove: async (items) => {
      queue = removeSent(queue, items);
    },
    send: async (r) => {
      sent.push(r);
      return statusFor(r);
    },
    warn,
  };
  return { io, sent, warn, queue: () => queue };
}

describe('drainQueue', () => {
  it('성공하면 모두 비운다', async () => {
    const t = makeIO([meal(1), gym('d1'), gym('d2')], () => 200);
    const r = await drainQueue(t.io);
    expect(r).toEqual({ sent: 3, dropped: 0, failed: false, unauthorized: false });
    expect(t.queue()).toEqual([]);
    expect(t.sent).toHaveLength(2); // 끼니 1 + 이벤트 한 묶음
  });
  it('5xx면 멈추고 큐를 그대로 둔다', async () => {
    const t = makeIO([meal(1), meal(2)], () => 503);
    const r = await drainQueue(t.io);
    expect(r.failed).toBe(true);
    expect(t.queue()).toHaveLength(2);
    expect(t.sent).toHaveLength(1);
  });
  it('401이면 멈추고 큐를 그대로 둔다 (실패로 세지 않는다)', async () => {
    const t = makeIO([meal(1), meal(2), gym('d1')], () => 401);
    const r = await drainQueue(t.io);
    expect(r).toEqual({ sent: 0, dropped: 0, failed: false, unauthorized: true });
    expect(t.queue()).toHaveLength(3);
    expect(t.sent).toHaveLength(1);
    expect(t.warn).not.toHaveBeenCalled();
  });
  it('이벤트 묶음이 401이어도 한 줄씩 쪼개지 않고 그대로 둔다', async () => {
    const t = makeIO([gym('d1'), gym('d2')], () => 401);
    const r = await drainQueue(t.io);
    expect(r.unauthorized).toBe(true);
    expect(t.queue()).toHaveLength(2);
    expect(t.sent).toHaveLength(1);
  });
  it('네트워크 오류도 유지', async () => {
    const t = makeIO([gym('d1')], () => null);
    expect((await drainQueue(t.io)).failed).toBe(true);
    expect(t.queue()).toHaveLength(1);
  });
  it('4xx는 버리고 다음으로 간다', async () => {
    const t = makeIO([meal(1), meal(2)], (r) => ((r.body as { index: number }).index === 1 ? 400 : 200));
    const r = await drainQueue(t.io);
    expect(r).toEqual({ sent: 1, dropped: 1, failed: false, unauthorized: false });
    expect(t.queue()).toEqual([]);
    expect(t.warn).toHaveBeenCalled();
  });
  it('이벤트 묶음이 4xx면 한 줄씩 다시 보내 나쁜 줄만 버린다', async () => {
    const t = makeIO([gym('good'), gym('bad')], (r) => {
      const b = r.body as SyncEventsBody;
      return b.gymLogs.length > 1 || b.gymLogs[0].date === 'bad' ? 400 : 200;
    });
    const r = await drainQueue(t.io);
    expect(r).toEqual({ sent: 1, dropped: 1, failed: false, unauthorized: false });
    expect(t.queue()).toEqual([]);
  });
  it('보내는 동안 같은 key가 새 값으로 바뀌면 새 값은 남는다', () => {
    expect(removeSent([gym('d1', 'rest')], [gym('d1', 'geofence')])).toHaveLength(1);
    expect(removeSent([gym('d1', 'rest')], [gym('d1', 'rest')])).toHaveLength(0);
  });
});

describe('initialSyncItems', () => {
  const rows = {
    settings: settingsJson,
    meals: [
      {
        date: 'd1',
        index: 1,
        deadline: '08:00',
        barcode: null,
        ai: mealJson.ai,
        portion: 1,
        sharedMeal: false,
        loggedAt: 1000,
        status: 'logged',
      },
      {
        date: 'd1',
        index: 2,
        deadline: '12:00',
        barcode: null,
        ai: null,
        portion: 1,
        sharedMeal: false,
        loggedAt: null,
        status: 'pending',
      },
      {
        date: 'd1',
        index: 3,
        deadline: '15:00',
        barcode: null,
        ai: mealJson.ai,
        portion: 1,
        sharedMeal: false,
        loggedAt: 2000,
        status: 'overdue',
      },
    ],
    gymLogs: [
      { date: 'd1', checkInAt: 5, verifiedBy: 'geofence' as const },
      { date: 'd2', checkInAt: null, verifiedBy: null },
    ],
    sleepLogs: [{ date: 'd1', lockedAt: 1, unlockedAt: null }],
    lockEvents: [{ type: 'meal' as const, startedAt: 10, endedAt: null, releasedBy: null }],
    couponUses: [{ type: 'rest' as const, usedAt: 20, weekKey: 'w' }],
  };
  it('기록된 끼니·인증된 헬스·나머지 전부를 고른다', () => {
    const items = initialSyncItems(rows, (m) => toMealBackup({ ...m, ai: m.ai!, loggedAt: m.loggedAt! }));
    expect(items.map((i) => i.key)).toEqual([
      'settings',
      'meal:d1:1',
      'gym:d1',
      'sleep:d1',
      'lock:meal:10',
      'coupon:rest:20',
    ]);
  });
  it('설정이 없으면 설정은 빼고 올린다', () => {
    const items = initialSyncItems({ ...rows, settings: null }, (m) =>
      toMealBackup({ ...m, ai: m.ai!, loggedAt: m.loggedAt! }),
    );
    expect(items[0].key).toBe('meal:d1:1');
  });
});

describe('사진 백업 큐', () => {
  const ph = (i: number, uri: string | null = `file:///m${i}.jpg`) => photoItem({ date: '2026-09-26', index: i, uri });

  it('끼니 뒤, 이벤트 앞에 사진을 올린다. uri가 없으면 그 끼니 사진을 지운다', () => {
    const reqs = planRequests([ph(1), gym('d1'), meal(1), ph(2, null)]);
    expect(reqs.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/meals',
      'PUT /api/meals/photo?date=2026-09-26&index=1',
      'DELETE /api/meals/photo?date=2026-09-26&index=2',
      'POST /api/sync/events',
    ]);
    expect(reqs[1].upload).toEqual({ uri: 'file:///m1.jpg' });
    expect(reqs[2].upload).toBeUndefined();
  });

  it('백업을 끄면 그 전에 쌓인 사진은 보내지 않고 "모두 지우기"와 함께 치운다. 다시 켠 뒤 사진은 보낸다', () => {
    const q = [ph(1), ph(2), PHOTO_WIPE, ph(3)];
    const reqs = planRequests(q);
    expect(reqs.map((r) => `${r.method} ${r.path}`)).toEqual([
      'DELETE /api/meals/photos',
      'PUT /api/meals/photo?date=2026-09-26&index=3',
    ]);
    expect(reqs[0].items.map((i) => i.key)).toEqual(['photoWipe', 'photo:2026-09-26:1', 'photo:2026-09-26:2']);
  });

  it('처음 전체 올림: 사진 백업을 켰거나 친구에게 공유한 끼니만 사진도 올린다', () => {
    const base = {
      gymLogs: [],
      sleepLogs: [],
      lockEvents: [],
      couponUses: [],
      meals: [
        {
          date: '2026-09-26',
          index: 1,
          deadline: '08:00',
          barcode: null,
          ai: mealJson.ai,
          portion: 1,
          sharedMeal: false,
          loggedAt: 1,
          status: 'logged',
          photoUri: 'file:///a.jpg',
        },
      ],
    };
    const toMeal = () => mealJson;
    const kinds = (on: boolean) =>
      initialSyncItems({ ...base, settings: { ...settingsJson, photoBackup: on } }, toMeal).map((i) => i.kind);
    expect(kinds(false)).toEqual(['settings', 'meal']);
    expect(kinds(true)).toEqual(['settings', 'meal', 'photo']);
    // 백업을 꺼도 친구에게 공유한 끼니 사진은 올린다
    const shared = { ...base, meals: [{ ...base.meals[0], shareFriends: true }] };
    expect(
      initialSyncItems({ ...shared, settings: { ...settingsJson, photoBackup: false } }, toMeal).map((i) => i.kind),
    ).toEqual(['settings', 'meal', 'photo']);
  });
});
