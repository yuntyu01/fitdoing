import {
  ALWAYS_ALLOWED_PACKAGES,
  HOLD_IDLE,
  HOLD_MS,
  activeLocks,
  allowedPackages,
  decideLock,
  emergencyLeft,
  formatCountdown,
  holdCancel,
  holdConfirm,
  holdRemainingSec,
  holdStart,
  holdTick,
  lockKey,
  naturalEnd,
  releaseMethods,
  type LockSettings,
  type LockSnapshot,
} from './lock';
import { mealKey } from './notifications';
import { weekKey } from './time';

const settings: LockSettings = {
  mode: 'normal',
  meals: [
    { index: 1, deadline: '08:00' },
    { index: 2, deadline: '14:00' },
    { index: 3, deadline: '17:00' },
    { index: 4, deadline: '19:00' },
  ],
  gym: { enabled: true, days: [0, 1, 2, 3, 4], arriveBy: '20:00' },
  sleep: { enabled: true, bedTime: '23:30', wakeTime: '07:00' },
  lockMinutes: 120,
};

// 2026-10-05 은 월요일
const at = (h: number, m = 0, day = 5) => new Date(2026, 9, day, h, m);

function snap(now: Date, over: Partial<LockSnapshot> = {}, s: Partial<LockSettings> = {}): LockSnapshot {
  return {
    now,
    settings: { ...settings, ...s },
    loggedMeals: new Set(),
    gymDoneDates: new Set(),
    released: new Set(),
    ...over,
  };
}

const allMeals = (day: string) => new Set([1, 2, 3, 4].map((i) => mealKey(day, i)));

describe('끼니 잠금', () => {
  it('마감 전에는 잠기지 않는다', () => {
    expect(decideLock(snap(at(7, 59))).lock).toBeNull();
  });

  it('마감이 지났는데 미기록이면 lockMinutes 동안 잠근다', () => {
    const { lock } = decideLock(snap(at(8, 1)));
    expect(lock).toMatchObject({ type: 'meal', meal: 1, reason: 'meal_missed' });
    expect(lock!.startedAt).toBe(at(8).getTime());
    expect(lock!.until).toBe(at(10).getTime());
  });

  it('lockMinutes가 지나면 저절로 풀린다', () => {
    expect(decideLock(snap(at(10, 0))).lock).toBeNull();
    expect(decideLock(snap(at(9, 59))).lock).not.toBeNull();
  });

  it('사진으로 기록하면 해제된다', () => {
    const s = snap(at(8, 30), { loggedMeals: new Set([mealKey('2026-10-05', 1)]) });
    expect(decideLock(s).lock).toBeNull();
  });

  it('풀린 잠금은 다시 걸리지 않는다', () => {
    const s = snap(at(8, 30), { released: new Set([lockKey('meal', at(8).getTime())]) });
    expect(decideLock(s).lock).toBeNull();
  });

  it('끼니 둘이 겹치면 최근 것을 보여주고 둘 다 covers에 담는다', () => {
    const s = snap(at(14, 30), {}, { meals: [{ index: 1, deadline: '13:00' }, { index: 2, deadline: '14:00' }] });
    const { lock } = decideLock(s);
    expect(lock!.meal).toBe(2);
    expect(lock!.covers).toEqual([at(13).getTime(), at(14).getTime()]);
  });

  it('자정을 넘긴 끼니 마감도 잠근다', () => {
    const meals = [{ index: 1, deadline: '20:00' }, { index: 2, deadline: '00:30' }];
    const s = snap(at(0, 45, 6), { loggedMeals: new Set([mealKey('2026-10-05', 1)]) }, { meals, sleep: { enabled: false, bedTime: '23:30', wakeTime: '07:00' } });
    const { lock } = decideLock(s);
    expect(lock).toMatchObject({ type: 'meal', meal: 2 });
  });

  it('notBefore 이전에 시작한 잠금은 걸지 않는다 (설정 직후 소급 방지)', () => {
    const s = snap(at(8, 30), { notBefore: at(8, 20).getTime() });
    expect(decideLock(s).lock).toBeNull();
  });
});

describe('헬스 잠금', () => {
  it('헬스 요일, 도착 시간 전에는 잠기지 않는다', () => {
    expect(decideLock(snap(at(19, 59), { loggedMeals: allMeals('2026-10-05') })).lock).toBeNull();
  });

  it('도착 시간이 지났고 확인 전이면 잠근다', () => {
    const { lock } = decideLock(snap(at(20, 5), { loggedMeals: allMeals('2026-10-05') }));
    expect(lock).toMatchObject({ type: 'gym', reason: 'gym_not_arrived' });
    expect(lock!.until).toBe(new Date(2026, 9, 6).getTime());
  });

  it('도착을 확인하면 풀린다', () => {
    const s = snap(at(20, 5), { loggedMeals: allMeals('2026-10-05'), gymDoneDates: new Set(['2026-10-05']) });
    expect(decideLock(s).lock).toBeNull();
  });

  it('헬스 요일이 아니면 잠기지 않는다', () => {
    // 2026-10-10 토요일
    const s = snap(at(20, 5, 10), { loggedMeals: allMeals('2026-10-10') });
    expect(decideLock(s).lock).toBeNull();
  });

  it('헬스가 꺼져 있으면 잠기지 않는다', () => {
    const s = snap(at(20, 5), { loggedMeals: allMeals('2026-10-05') }, { gym: { ...settings.gym, enabled: false } });
    expect(decideLock(s).lock).toBeNull();
  });
});

describe('취침 잠금', () => {
  const base = { loggedMeals: allMeals('2026-10-05'), gymDoneDates: new Set(['2026-10-05']) };

  it('취침 시각부터 잠근다', () => {
    expect(decideLock(snap(at(23, 29), base)).lock).toBeNull();
    const { lock } = decideLock(snap(at(23, 30), base));
    expect(lock).toMatchObject({ type: 'sleep', reason: 'sleep_time' });
    expect(lock!.until).toBe(at(7, 0, 6).getTime());
  });

  it('자정을 넘겨도 기상 전까지 잠겨 있다', () => {
    const s = snap(at(3, 0, 6), { loggedMeals: allMeals('2026-10-05') });
    expect(decideLock(s).lock).toMatchObject({ type: 'sleep', startedAt: at(23, 30).getTime() });
  });

  it('기상 시각에 풀린다', () => {
    const s = snap(at(7, 0, 6), { loggedMeals: new Set([...allMeals('2026-10-05'), mealKey('2026-10-06', 1)]) });
    expect(decideLock(s).lock).toBeNull();
  });

  it('같은 날 안에서 끝나는 취침(01:00~08:00)도 처리한다', () => {
    const sl = { enabled: true, bedTime: '01:00', wakeTime: '08:00' };
    expect(decideLock(snap(at(0, 59, 6), {}, { sleep: sl, meals: [] })).lock).toBeNull();
    expect(decideLock(snap(at(1, 0, 6), {}, { sleep: sl, meals: [] })).lock?.type).toBe('sleep');
    expect(decideLock(snap(at(8, 0, 6), {}, { sleep: sl, meals: [] })).lock).toBeNull();
  });

  it('취침이 꺼져 있으면 잠기지 않는다', () => {
    const s = snap(at(23, 45), base, { sleep: { enabled: false, bedTime: '23:30', wakeTime: '07:00' } });
    expect(decideLock(s).lock).toBeNull();
  });

  it('naturalEnd가 잠금 종류별로 맞다', () => {
    expect(naturalEnd('meal', at(8).getTime(), settings)).toBe(at(10).getTime());
    expect(naturalEnd('sleep', at(23, 30).getTime(), settings)).toBe(at(7, 0, 6).getTime());
  });
});

describe('우선순위 취침 > 헬스 > 끼니', () => {
  it('셋이 겹치면 취침', () => {
    expect(decideLock(snap(at(23, 40))).lock?.type).toBe('sleep');
  });

  it('헬스와 끼니가 겹치면 헬스', () => {
    const s = snap(at(20, 10), {}, { meals: [{ index: 1, deadline: '19:30' }] });
    expect(decideLock(s).lock?.type).toBe('gym');
    expect(activeLocks(s).map((l) => l.type)).toEqual(['gym', 'meal']);
  });

  it('위 순위가 풀리면 아래 잠금이 남는다', () => {
    const s = snap(at(20, 10), { gymDoneDates: new Set(['2026-10-05']) }, { meals: [{ index: 1, deadline: '19:30' }] });
    expect(decideLock(s).lock?.type).toBe('meal');
  });
});

describe('절대 규칙: 칼로리 초과로는 잠그지 않는다', () => {
  it('LockSnapshot에는 칼로리·영양 입력이 없다', () => {
    const keys = Object.keys(snap(at(12)));
    expect(keys.join(',')).not.toMatch(/kcal|calor|carb|protein|fat|target/i);
    expect(Object.keys(settings).join(',')).not.toMatch(/kcal|calor|target/i);
  });

  it('모든 끼니를 기록하고 헬스·취침도 지켰다면, 하루 어느 시각에도 잠금이 없다 (칼로리를 얼마나 먹었든)', () => {
    const gym = { ...settings.gym, enabled: false };
    const sleep = { enabled: false, bedTime: '23:30', wakeTime: '07:00' };
    for (let min = 0; min < 48 * 60; min += 10) {
      const now = new Date(2026, 9, 5, 0, min);
      const s = snap(
        now,
        { loggedMeals: new Set([...allMeals('2026-10-05'), ...allMeals('2026-10-06')]) },
        { gym, sleep },
      );
      expect(decideLock(s).lock).toBeNull();
      expect(activeLocks(s)).toEqual([]);
    }
  });

  it('나올 수 있는 이유는 끼니 미기록·헬스 미도착·취침뿐이다', () => {
    const reasons = new Set<string>();
    for (let min = 0; min < 24 * 60; min += 5) {
      for (const l of activeLocks(snap(new Date(2026, 9, 5, 0, min)))) reasons.add(l.reason);
    }
    for (const r of reasons) expect(['meal_missed', 'gym_not_arrived', 'sleep_time']).toContain(r);
  });
});

describe('순한맛', () => {
  it('잠그지 않고 알림만 (notifyOnly)', () => {
    const d = decideLock(snap(at(8, 30), {}, { mode: 'mild' }));
    expect(d.lock).toBeNull();
    expect(d.notifyOnly).toMatchObject({ type: 'meal' });
  });

  it('걸릴 게 없으면 둘 다 null', () => {
    expect(decideLock(snap(at(7, 0), {}, { mode: 'mild' }))).toEqual({ lock: null, notifyOnly: null });
  });
});

describe('해제 수단', () => {
  it('끼니: 사진·비상, 매운맛은 쿠폰도', () => {
    expect(releaseMethods('meal', 'normal')).toEqual(['action', 'emergency', 'time']);
    expect(releaseMethods('meal', 'spicy')).toContain('coupon');
  });
  it('헬스: 도착·휴식권', () => {
    expect(releaseMethods('gym', 'normal')).toEqual(['action', 'coupon', 'time']);
  });
  it('취침: 시간으로만', () => {
    expect(releaseMethods('sleep', 'normal')).toEqual(['time']);
  });
});

describe('비상 해제 주 N회', () => {
  it('남은 횟수는 0 아래로 내려가지 않는다', () => {
    expect(emergencyLeft(2, 0)).toBe(2);
    expect(emergencyLeft(2, 1)).toBe(1);
    expect(emergencyLeft(2, 5)).toBe(0);
  });

  it('월요일에 초기화된다 (사용 기록의 weekKey가 바뀐다)', () => {
    const sun = new Date(2026, 9, 4, 23, 59);
    const mon = new Date(2026, 9, 5, 0, 0);
    expect(weekKey(sun)).not.toBe(weekKey(mon));
    const uses = [{ weekKey: weekKey(sun) }, { weekKey: weekKey(sun) }];
    const used = (d: Date) => uses.filter((u) => u.weekKey === weekKey(d)).length;
    expect(emergencyLeft(2, used(sun))).toBe(0);
    expect(emergencyLeft(2, used(mon))).toBe(2);
  });
});

describe('5초 대기 상태기계', () => {
  it('시작 직후에는 확정할 수 없다', () => {
    const s = holdStart('emergency', 1000);
    const r = holdConfirm(s, 3000);
    expect(r.confirmed).toBeNull();
    expect(r.state.phase).toBe('waiting');
  });

  it('5초가 지나면 ready, 그때 확정된다', () => {
    const s = holdStart('coupon', 1000);
    expect(holdTick(s, 1000 + HOLD_MS - 1).phase).toBe('waiting');
    expect(holdTick(s, 1000 + HOLD_MS).phase).toBe('ready');
    const r = holdConfirm(s, 1000 + HOLD_MS);
    expect(r.confirmed).toBe('coupon');
    expect(r.state).toEqual(HOLD_IDLE);
  });

  it('취소하면 처음으로, idle에서는 확정되지 않는다', () => {
    expect(holdCancel()).toEqual(HOLD_IDLE);
    expect(holdConfirm(HOLD_IDLE, 99999).confirmed).toBeNull();
  });

  it('남은 초는 올림', () => {
    const s = holdStart('emergency', 0);
    expect(holdRemainingSec(s, 0)).toBe(5);
    expect(holdRemainingSec(s, 1)).toBe(5);
    expect(holdRemainingSec(s, 4001)).toBe(1);
    expect(holdRemainingSec(s, 5000)).toBe(0);
    expect(holdRemainingSec(HOLD_IDLE, 0)).toBe(0);
  });
});

describe('항상 허용 앱', () => {
  it('본 앱과 전화·문자·지도·알람을 포함하고 사용자 목록과 합친다', () => {
    const list = allowedPackages(['com.kakao.talk', 'com.fitdoing.app']);
    expect(list).toContain('com.fitdoing.app');
    expect(list).toContain('com.kakao.talk');
    expect(list.filter((p) => p === 'com.fitdoing.app')).toHaveLength(1);
    expect(ALWAYS_ALLOWED_PACKAGES.some((p) => p.includes('dialer'))).toBe(true);
    expect(ALWAYS_ALLOWED_PACKAGES.some((p) => p.includes('messag') || p.includes('mms'))).toBe(true);
    expect(ALWAYS_ALLOWED_PACKAGES.some((p) => p.includes('maps'))).toBe(true);
    expect(ALWAYS_ALLOWED_PACKAGES.some((p) => p.includes('clock'))).toBe(true);
  });
});

describe('표시', () => {
  it('카운트다운', () => {
    expect(formatCountdown(7_327_000)).toBe('2:02:07');
    expect(formatCountdown(-5)).toBe('0:00:00');
    expect(formatCountdown(1)).toBe('0:00:01');
  });
});
