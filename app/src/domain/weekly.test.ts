import { weeklySeries, weeklySummary, type WeeklyRow } from './weekly';

const row = (date: string, kcal: number, portion = 1): WeeklyRow => ({
  date,
  ai: { kcal, carbs: kcal / 10, protein: kcal / 20, fat: kcal / 30 },
  portion,
});

// 2026-09-26 은 토요일. 이번 주 = 9/21(월) ~ 9/27(일), 지난주 = 9/14 ~ 9/20
const NOW = new Date(2026, 8, 26, 18, 40);

describe('weeklySeries', () => {
  const rows = [
    row('2026-09-14', 1700),
    row('2026-09-15', 1500),
    row('2026-09-23', 1500),
    row('2026-09-24', 1800),
    row('2026-09-26', 400),
    row('2026-09-26', 760, 0.5), // 먹은 비율을 곱한다 → 380
  ];
  const s = weeklySeries(rows, 'kcal', 1600, NOW);

  it('요일 상태를 나눈다', () => {
    expect(s.days.map((d) => d.state)).toEqual(['missing', 'missing', 'done', 'done', 'missing', 'today', 'future']);
  });

  it('오늘 값은 진행 중인 합계, 미래·기록 없는 날은 null', () => {
    expect(s.days[5].current).toBe(780);
    expect(s.days[6].current).toBeNull();
    expect(s.days[0].current).toBeNull();
  });

  it('지난주 같은 요일 값을 붙인다', () => {
    expect(s.days[0].last).toBe(1700);
    expect(s.days[1].last).toBe(1500);
    expect(s.days[2].last).toBeNull();
  });

  it('평균은 오늘을 뺀 기록한 날만 센다', () => {
    expect(s.avg).toBe(1650);
    expect(s.lastAvg).toBe(1600);
  });

  it('목표 범위는 ±10%', () => {
    expect(s.band.lo).toBeCloseTo(1440);
    expect(s.band.hi).toBeCloseTo(1760);
  });

  it('기록이 하나도 없으면 평균은 null', () => {
    const e = weeklySeries([], 'kcal', 1600, NOW);
    expect(e.avg).toBeNull();
    expect(e.lastAvg).toBeNull();
    expect(e.max).toBeGreaterThan(1600);
  });

  it('나눠 먹은 끼니는 절반으로 센다', () => {
    const shared: WeeklyRow = { ...row('2026-09-24', 1000), sharedMeal: true };
    expect(weeklySeries([shared], 'kcal', 1600, NOW).days[3].current).toBe(500);
  });

  it('지표를 바꿀 수 있다', () => {
    expect(weeklySeries(rows, 'protein', 100, NOW).days[3].current).toBe(90);
  });
});

describe('weeklySummary', () => {
  // 목표 1600 → 범위 1440~1760. 수 1500(안), 목 1800(+200), 금 1200(-400), 토는 오늘이라 빠진다.
  const rows = [row('2026-09-23', 1500), row('2026-09-24', 1800), row('2026-09-25', 1200), row('2026-09-26', 3000)];
  const sum = weeklySummary(weeklySeries(rows, 'kcal', 1600, NOW));

  it('완료한 날과 범위 안에 든 날을 센다 (오늘 제외)', () => {
    expect(sum.completed).toBe(3);
    expect(sum.achieved).toBe(1);
  });

  it('범위 밖에서 목표와 가장 많이 차이 난 날을 고른다', () => {
    expect(sum.furthest).toEqual({ index: 4, diff: -400 });
  });

  it('모두 범위 안이면 furthest 는 null', () => {
    expect(weeklySummary(weeklySeries([row('2026-09-23', 1600)], 'kcal', 1600, NOW)).furthest).toBeNull();
  });

  it('완료한 날이 없으면 0', () => {
    expect(weeklySummary(weeklySeries([], 'kcal', 1600, NOW))).toEqual({ completed: 0, achieved: 0, furthest: null });
  });
});

describe('날짜별 목표', () => {
  // 목요일(2026-09-24)부터 목표를 1600 → 2000 으로 바꿨다
  const targetOn = (date: string) => (date >= '2026-09-24' ? 2000 : 1600);
  const rows = [row('2026-09-23', 1600), row('2026-09-24', 2000)];
  const s = weeklySeries(rows, 'kcal', targetOn, NOW);

  it('지난 날은 그날 목표로 판단한다', () => {
    expect(s.days[2].target).toBe(1600);
    expect(s.days[3].target).toBe(2000);
    expect(weeklySummary(s)).toEqual({ completed: 2, achieved: 2, furthest: null });
  });

  it('점선은 오늘 목표', () => {
    expect(s.target).toBe(2000);
  });

  it('지금 목표 하나로만 보면 수요일이 범위 밖이 된다(이력 없을 때의 예전 동작)', () => {
    expect(weeklySummary(weeklySeries(rows, 'kcal', 2000, NOW)).achieved).toBe(1);
  });
});
