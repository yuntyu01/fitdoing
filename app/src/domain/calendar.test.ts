import { dayState, isEmptyMonth, monthGrid, monthRange, monthSummary, shiftMonth, type DayFacts } from './calendar';
import { buildDayDetail, buildMonthFacts } from './records';

const f = (o: Partial<DayFacts>): DayFacts => ({
  date: '2026-10-01',
  mealsLogged: 0,
  mealsPlanned: 3,
  locked: false,
  gym: false,
  sleep: false,
  ...o,
});

describe('월 격자', () => {
  it('2026-10은 목요일 시작, 5주', () => {
    const g = monthGrid({ year: 2026, month: 9 });
    expect(g).toHaveLength(5);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0].slice(0, 3)).toEqual([null, null, null]);
    expect(g[0][3]).toBe('2026-10-01');
    expect(g[4][5]).toBe('2026-10-31');
    expect(g[4][6]).toBeNull();
  });
  it('월요일 시작 달은 앞 빈칸이 없다 (2026-06)', () => {
    const g = monthGrid({ year: 2026, month: 5 });
    expect(g[0][0]).toBe('2026-06-01');
  });
  it('일요일 시작 달은 앞 빈칸 6개 (2026-02)', () => {
    const g = monthGrid({ year: 2026, month: 1 });
    expect(g[0].filter((c) => c === null)).toHaveLength(6);
    expect(g[0][6]).toBe('2026-02-01');
    expect(g).toHaveLength(5);
  });
  it('윤년 2월 29일, 해 넘김 이동', () => {
    expect(monthRange({ year: 2028, month: 1 }).end).toBe('2028-02-29');
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('날 상태와 월 요약', () => {
  it('다 찍음/일부/없음', () => {
    expect(dayState(f({ mealsLogged: 3 }))).toBe('full');
    expect(dayState(f({ mealsLogged: 1 }))).toBe('partial');
    expect(dayState(f({ mealsLogged: 0 }))).toBe('none');
  });
  it('요약 3개', () => {
    const s = monthSummary([f({ mealsLogged: 3, gym: true }), f({ mealsLogged: 1, locked: true }), f({ locked: true, gym: true })]);
    expect(s).toEqual({ full: 1, locked: 2, gym: 2 });
  });
  it('빈 달', () => {
    expect(isEmptyMonth([f({}), f({})])).toBe(true);
    expect(isEmptyMonth([f({ sleep: true })])).toBe(false);
  });
});

describe('로컬 행 -> 사실', () => {
  it('끼니·잠금·헬스·취침을 날짜별로 합친다', () => {
    const facts = buildMonthFacts({
      dates: ['2026-10-01', '2026-10-02'],
      mealsPlanned: 2,
      meals: [
        { date: '2026-10-01', status: 'logged' },
        { date: '2026-10-01', status: 'logged' },
        { date: '2026-10-02', status: 'locked' },
      ],
      gymDates: ['2026-10-02'],
      sleepDates: ['2026-10-01'],
      lockStartedAt: [new Date(2026, 9, 1, 15).getTime()],
    });
    expect(facts[0]).toMatchObject({ mealsLogged: 2, locked: true, gym: false, sleep: true });
    expect(facts[1]).toMatchObject({ mealsLogged: 0, locked: true, gym: true });
  });
  it('날 카드: 합계는 portion을 곱하고 빈 끼니는 빈 칸', () => {
    const ai = { items: [], kcal: 400, carbs: 40, protein: 20, fat: 10, confidence: 1 };
    const d = buildDayDetail(f({ mealsLogged: 1, mealsPlanned: 3 }), [
      { date: '2026-10-01', index: 2, photoUri: 'file:///a.jpg', ai, portion: 0.5, status: 'logged' },
      { date: '2026-10-01', index: 1, photoUri: null, ai: null, portion: 1, status: 'pending' },
    ]);
    expect(d.totals.kcal).toBe(200);
    expect(d.meals.map((m) => m.logged)).toEqual([false, true, false]);
    expect(d.meals[1].photoUri).toBe('file:///a.jpg');
    expect(d.empty).toBe(false);
  });
});
