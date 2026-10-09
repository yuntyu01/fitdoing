import type { Settings } from '../db/schema';
import { toMealBackup } from './logging';
import {
  fromCouponUseBody,
  fromGymLogBody,
  fromLockEventBody,
  fromMealView,
  fromSettingsBody,
  fromSleepLogBody,
  snapshotToRows,
  type MealView,
} from './restore';
import {
  toCouponUseBody,
  toGymLogBody,
  toLockEventBody,
  toSettingsBody,
  toSleepLogBody,
  type CouponUseBody,
  type GymLogBody,
  type LockEventBody,
  type SleepLogBody,
} from './sync';

const defaults: Settings = {
  mode: 'normal',
  goal: 'keep',
  sex: null,
  age: null,
  activity: null,
  activityInput: null,
  heightCm: 175,
  weightKg: 70,
  meals: [
    { index: 1, deadline: '08:00' },
    { index: 2, deadline: '13:00' },
  ],
  gym: {
    enabled: true,
    days: [0, 1],
    weeklyTarget: 2,
    arriveBy: '19:00',
    name: '',
    address: '',
    lat: null,
    lng: null,
    radiusM: 150,
  },
  sleep: { enabled: true, bedTime: '23:30', wakeTime: '07:00' },
  coupons: { rest: 2, cheat: 2 },
  targets: { kcal: 1600, carbs: 180, protein: 100, fat: 53 },
  nutrition: null,
  targetHistory: [],
  allowedApps: [],
  lockMinutes: 120,
  emergencyPerWeek: 2,
  photoBackup: false,
  nickname: '',
  themeMode: 'system',
  notifications: true,
  shareFriends: false,
  foodStyle: { pattern: 'general', eggs: true, dairy: true },
  allergies: [],
  fasting: null,
};

const mine: Settings = {
  mode: 'spicy',
  goal: 'bulk',
  sex: 'female',
  age: 27,
  activity: 'active',
  activityInput: { daily: 'walking', exercise: { type: 'strength', perWeek: 4, minutes: 60, intensity: 'vigorous' } },
  heightCm: 168,
  weightKg: 61.5,
  meals: [
    { index: 1, deadline: '07:30' },
    { index: 2, deadline: '12:30' },
    { index: 3, deadline: '18:30' },
  ],
  gym: {
    enabled: true,
    days: [0, 2, 4],
    weeklyTarget: 3,
    arriveBy: '20:00',
    name: '바디핏짐',
    address: '서울 성동구',
    lat: 37.5446,
    lng: 127.0557,
    radiusM: 200,
  },
  sleep: { enabled: false, bedTime: '00:30', wakeTime: '08:00' },
  coupons: { rest: 1, cheat: 0 },
  targets: { kcal: 2700, carbs: 307, protein: 111, fat: 115 },
  nutrition: {
    formula: 'kdri2025-eer-adult',
    policy: 'fitdoing-2026.10',
    goalAdjustPct: 15,
    plan: { mode: 'training', proteinPerKg: 1.8, fatPct: 25, carb: { kind: 'lchf', by: 'grams', value: 120 } },
    eligibility: { pregnant: false, lactating: false, medicalDiet: false },
    appliedOn: '2026-10-08',
  },
  targetHistory: [
    { from: '2000-01-01', kcal: 1800, carbs: 200, protein: 120, fat: 60 },
    { from: '2026-10-08', kcal: 2700, carbs: 307, protein: 111, fat: 115 },
  ],
  allowedApps: ['com.kakao.talk'],
  lockMinutes: 180,
  emergencyPerWeek: 1,
  photoBackup: true,
  nickname: '지훈',
  themeMode: 'dark',
  notifications: false,
  shareFriends: true,
  foodStyle: { pattern: 'vegetarian', eggs: true, dairy: false },
  allergies: ['땅콩'],
  fasting: { eatFrom: '12:00', eatTo: '20:00' },
};

// 서버를 거쳐 오는 것처럼 JSON 으로 한 번 갔다 온다 (undefined 는 사라지고 null 은 남는다).
const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('fromSettingsBody', () => {
  it('로컬 → 서버 본문 → 로컬로 그대로 돌아온다', () => {
    expect(fromSettingsBody(wire(toSettingsBody(mine)), defaults)).toEqual(mine);
  });

  it('헬스장 위치가 없는 설정(null)도 돌아온다', () => {
    const noGym: Settings = { ...mine, gym: { ...mine.gym, name: '', address: '', lat: null, lng: null } };
    expect(fromSettingsBody(wire(toSettingsBody(noGym)), defaults)).toEqual(noGym);
  });

  it('서버가 이름·주소를 null 로 줘도 빈 문자열이 된다', () => {
    const body = wire(toSettingsBody(mine)) as unknown as { gym: Record<string, unknown> };
    body.gym.name = null;
    body.gym.address = null;
    const s = fromSettingsBody(body, defaults);
    expect(s.gym.name).toBe('');
    expect(s.gym.address).toBe('');
  });

  it('빠진 부분(gym·targets 가 null 등)은 기본값으로 채운다', () => {
    const s = fromSettingsBody({ mode: 'mild', gym: null, targets: null, meals: [], mystery: 1 }, defaults);
    expect(s.mode).toBe('mild');
    expect(s.gym).toEqual(defaults.gym);
    expect(s.targets).toEqual(defaults.targets);
    expect(s.meals).toEqual(defaults.meals);
  });

  it('직접 설정(g 고정) 계산 입력도 그대로 돌아온다', () => {
    const custom: Settings = {
      ...mine,
      nutrition: {
        ...mine.nutrition!,
        plan: {
          mode: 'custom',
          custom: { kind: 'fixKcal', kcal: 2000, solve: 'fat', grams: { carbs: 200, protein: 150, fat: 0 } },
        },
      },
    };
    expect(fromSettingsBody(wire(toSettingsBody(custom)), defaults)).toEqual(custom);
  });

  it('예전 설정(새 필드 없음): 목표는 그대로, 성별·나이·활동은 모름(null)으로 둔다', () => {
    const old = {
      mode: 'normal',
      goal: 'gain',
      heightCm: 175,
      weightKg: 70,
      targets: { kcal: 2450, carbs: 330, protein: 126, fat: 68 },
    };
    const s = fromSettingsBody(old, { ...defaults, sex: 'male', age: 30, activity: 'low' });
    expect(s.goal).toBe('gain');
    expect(s.targets).toEqual(old.targets);
    expect(s.sex).toBeNull();
    expect(s.age).toBeNull();
    expect(s.activity).toBeNull();
    expect(s.nutrition).toBeNull();
    expect(s.targetHistory).toEqual([]);
    expect(s.foodStyle).toEqual({ pattern: 'general', eggs: true, dairy: true });
  });

  it('모양이 틀린 계산 입력은 버리고(null) 목표는 지킨다', () => {
    const s = fromSettingsBody(
      { ...wire(toSettingsBody(mine)), nutrition: { plan: { mode: 'keto' } }, sex: 'other', age: -3 },
      defaults,
    );
    expect(s.nutrition).toBeNull();
    expect(s.sex).toBeNull();
    expect(s.age).toBeNull();
    expect(s.targets).toEqual(mine.targets);
  });

  it('비건이면 달걀·유제품은 false', () => {
    const s = fromSettingsBody({ foodStyle: { pattern: 'vegan', eggs: true, dairy: true } }, defaults);
    expect(s.foodStyle).toEqual({ pattern: 'vegan', eggs: false, dairy: false });
  });

  it('허용되지 않는 값은 기본값으로', () => {
    expect(fromSettingsBody({ mode: 'extreme', goal: 5 }, defaults)).toMatchObject({ mode: 'normal', goal: 'keep' });
  });
});

/** 서버가 저장하고 돌려주는 모양을 흉내 낸다 (meal.NutritionOf: 먹은 만큼 곱해 반올림). */
function serverView(b: ReturnType<typeof toMealBackup>): MealView {
  const f = b.portion * (b.sharedMeal ? 0.5 : 1);
  const r = (v: number) => Math.floor(v * f + 0.5);
  return {
    id: 'm-1',
    date: b.date,
    index: b.index,
    deadline: b.deadline,
    barcode: b.barcode,
    items: b.ai.items,
    nutrition: { kcal: r(b.ai.kcal), carbs: r(b.ai.carbs), protein: r(b.ai.protein), fat: r(b.ai.fat) },
    portion: b.portion,
    sharedMeal: b.sharedMeal,
    shareFriends: b.shareFriends,
    cheat: b.cheat,
    confidence: b.ai.confidence,
    loggedAt: b.loggedAt,
  };
}

describe('fromMealView', () => {
  const local = {
    date: '2026-09-25',
    index: 2,
    deadline: '13:00',
    barcode: '8801234567890',
    ai: {
      items: [{ name: '현미밥', amount: '1공기', kcal: 480, carbs: 60, protein: 24, fat: 12, portion: 0.75 }],
      kcal: 480,
      carbs: 60,
      protein: 24,
      fat: 12,
      confidence: 0.8,
    },
    portion: 1,
    sharedMeal: false,
    shareFriends: true,
    loggedAt: 1790330400000,
  };

  it('로컬 끼니 → 서버 → 로컬로 돌아온다 (사진 없음)', () => {
    const restored = fromMealView(wire(serverView(toMealBackup(local))));
    expect(restored).toEqual({ id: 'm-1', ...local, photoUri: null, status: 'logged' });
  });

  it('먹은 양을 나눠 1인분 기준으로 되돌린다', () => {
    const half = { ...local, portion: 0.5 };
    const r = fromMealView(serverView(toMealBackup(half)))!;
    expect(r.ai).toMatchObject({ kcal: 480, carbs: 60, protein: 24, fat: 12 });
    expect(r.portion).toBe(0.5);
  });

  it('나눠 먹은 끼니도 되돌린다', () => {
    const shared = { ...local, sharedMeal: true };
    const r = fromMealView(serverView(toMealBackup(shared)))!;
    expect(r.ai.kcal).toBe(480);
    expect(r.sharedMeal).toBe(true);
  });

  it('1/4 만 먹어도 화면에 보이는 값(비율 곱 + 반올림)은 서버와 같다', () => {
    const q = { ...local, portion: 0.25, ai: { ...local.ai, kcal: 487 } };
    const view = serverView(toMealBackup(q));
    const r = fromMealView(view)!;
    expect(Math.round(r.ai.kcal * r.portion)).toBe(view.nutrition.kcal);
  });

  it('서버가 base를 주면 1/4만 먹은 끼니도 원본 그대로 돌아온다', () => {
    const q = { ...local, portion: 0.25, ai: { ...local.ai, kcal: 487, carbs: 61, protein: 23, fat: 17 } };
    const b = toMealBackup(q);
    const view = {
      ...serverView(b),
      base: { kcal: b.ai.kcal, carbs: b.ai.carbs, protein: b.ai.protein, fat: b.ai.fat },
    };
    const r = fromMealView(view)!;
    expect([r.ai.kcal, r.ai.carbs, r.ai.protein, r.ai.fat]).toEqual([487, 61, 23, 17]);
  });

  it('날짜·끼니 번호가 없는 행은 버린다', () => {
    expect(fromMealView({ ...serverView(toMealBackup(local)), index: 0 })).toBeNull();
  });
});

describe('이벤트 행', () => {
  it('헬스 기록', () => {
    const rows = [
      { date: '2026-09-25', verifiedBy: 'geofence' as const, checkInAt: 1790330400000 },
      { date: '2026-09-23', verifiedBy: 'rest' as const, checkInAt: null },
    ];
    for (const r of rows) {
      const b = wire(toGymLogBody(r)) as GymLogBody;
      expect(fromGymLogBody(b)).toEqual({ ...r, checkOutAt: null });
    }
    expect(fromGymLogBody({ date: '2026-09-23', verifiedBy: 'nope' as never, checkInAt: null })).toBeNull();
  });

  it('취침 기록', () => {
    const r = { date: '2026-09-25', lockedAt: 1790346600000, unlockedAt: null };
    expect(fromSleepLogBody(wire(toSleepLogBody(r)) as SleepLogBody)).toEqual(r);
  });

  it('잠금 이벤트', () => {
    const r = {
      type: 'meal' as const,
      startedAt: 1790244000000,
      endedAt: 1790251200000,
      releasedBy: 'emergency' as const,
      reason: '병원 예약 확인',
    };
    expect(fromLockEventBody(wire(toLockEventBody(r)) as LockEventBody)).toEqual(r);
    const open = { type: 'gym' as const, startedAt: 1790416800000, endedAt: null, releasedBy: null, reason: null };
    expect(fromLockEventBody(wire(toLockEventBody(open)) as LockEventBody)).toEqual(open);
  });

  it('쿠폰 사용', () => {
    const r = { type: 'rest' as const, usedAt: 1790160000000, weekKey: '2026-09-21' };
    expect(fromCouponUseBody(wire(toCouponUseBody(r)) as CouponUseBody)).toEqual(r);
  });
});

describe('snapshotToRows', () => {
  it('한 번도 백업하지 않은 계정은 설정이 null 이고 나머지는 비어 있다', () => {
    const rows = snapshotToRows(
      { settings: null, meals: [], gymLogs: [], sleepLogs: [], lockEvents: [], couponUses: [] },
      defaults,
    );
    expect(rows.settings).toBeNull();
    expect(rows.meals).toEqual([]);
  });

  it('모양이 어긋난 행은 건너뛰고 나머지를 복원한다', () => {
    const rows = snapshotToRows(
      {
        settings: wire(toSettingsBody(mine)),
        meals: [],
        gymLogs: [
          { date: '2026-09-25', verifiedBy: 'geofence', checkInAt: 1 },
          { date: '2026-09-26', verifiedBy: 'bad' as never, checkInAt: null },
        ],
        sleepLogs: [],
        lockEvents: [
          { type: 'meal', date: '2026-09-24', startedAt: null as never, endedAt: null, releasedBy: null, reason: null },
        ],
        couponUses: [],
      },
      defaults,
    );
    expect(rows.settings).toEqual(mine);
    expect(rows.gymLogs).toHaveLength(1);
    expect(rows.lockEvents).toHaveLength(0);
  });
});

describe('계산 입력과 최종 목표가 다를 때', () => {
  it('복원은 저장된 최종 목표를 그대로 쓰고 입력으로 다시 계산하지 않는다', () => {
    // 입력(운동 중심 1.8g/kg)으로 계산하면 다른 값이 나오지만, 적용된 목표(targets)가 기준이다
    const body = { ...wire(toSettingsBody(mine)), targets: { kcal: 1000, carbs: 100, protein: 60, fat: 40 } };
    const s = fromSettingsBody(body, defaults);
    expect(s.targets).toEqual({ kcal: 1000, carbs: 100, protein: 60, fat: 40 }); // 1200 미만도 그대로 (기록은 막지 않는다)
    expect(s.nutrition).toEqual(mine.nutrition);
  });
});
