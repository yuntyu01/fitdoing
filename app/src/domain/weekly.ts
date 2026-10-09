import { eatenFactor, type Nutrition } from './stats';
import { addDays, dateKey, parseDateKey, weekKey } from './time';

export type WeeklyMetric = 'kcal' | 'protein' | 'carbs' | 'fat';
export const WEEKLY_METRICS: WeeklyMetric[] = ['kcal', 'protein', 'carbs', 'fat'];

/** 목표 범위 ±10% */
export const BAND = 0.1;

/**
 * done: 기록한 지난 날 / today: 오늘(아직 진행 중) / missing: 기록이 없던 지난 날 / future: 아직 안 온 날
 * 목표를 넘겼는지 따위는 표시하지 않는다. 초과는 벌 대상이 아니다.
 */
export type WeekDayState = 'done' | 'today' | 'missing' | 'future';

export interface WeekDay {
  index: number; // 0=월 ... 6=일
  date: string;
  state: WeekDayState;
  current: number | null; // 이번 주 값
  last: number | null; // 지난주 같은 요일 값 (기록이 없으면 null)
  target: number; // 그날 적용되던 목표 (목표를 바꿔도 지난 날은 그때 목표로 본다)
}

export interface WeeklySeries {
  days: WeekDay[];
  /** 이번 주 평균: 오늘을 뺀, 기록한 지난 날의 평균. 아직 없으면 null */
  avg: number | null;
  /** 지난주 평균 (기록한 날 기준) */
  lastAvg: number | null;
  /** 점선: 오늘 목표 */
  target: number;
  band: { lo: number; hi: number };
  /** 막대 높이 계산용 상단 값 */
  max: number;
}

export interface WeeklyRow {
  date: string;
  ai: Nutrition | null;
  portion: number;
  sharedMeal?: boolean;
}

/** 날짜별 합계 (먹은 비율을 곱한다) */
export function dailyTotals(rows: WeeklyRow[], metric: WeeklyMetric): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.ai) continue;
    out.set(r.date, (out.get(r.date) ?? 0) + r.ai[metric] * eatenFactor(r.portion, r.sharedMeal));
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** target: 모든 날 같은 목표(숫자) 또는 날짜별 목표 */
export function weeklySeries(
  rows: WeeklyRow[],
  metric: WeeklyMetric,
  target: number | ((date: string) => number),
  now: Date,
): WeeklySeries {
  const totals = dailyTotals(rows, metric);
  const mon = parseDateKey(weekKey(now));
  const today = dateKey(now);
  const targetOn = typeof target === 'number' ? () => target : target;

  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = dateKey(addDays(mon, i));
    const lastV = totals.get(dateKey(addDays(mon, i - 7)));
    const v = totals.get(date);
    const state: WeekDayState = date > today ? 'future' : date === today ? 'today' : v ? 'done' : 'missing';
    return {
      index: i,
      date,
      state,
      current: state === 'future' || state === 'missing' ? null : (v ?? 0),
      last: lastV ? lastV : null,
      target: targetOn(date),
    };
  });
  const todayTarget = targetOn(today);

  const values = days.flatMap((d) => [d.current ?? 0, d.last ?? 0]);
  return {
    days,
    avg: mean(days.filter((d) => d.state === 'done').map((d) => d.current as number)),
    lastAvg: mean(days.flatMap((d) => (d.last ? [d.last] : []))),
    target: todayTarget,
    band: { lo: todayTarget * (1 - BAND), hi: todayTarget * (1 + BAND) },
    max: Math.max(todayTarget * 1.2, ...days.map((d) => d.target * 1.2), ...values, 1),
  };
}

export interface WeeklySummary {
  /** 기록을 마친 지난 날 (오늘 제외) */
  completed: number;
  /** 그중 목표 범위(±10%) 안에 든 날 */
  achieved: number;
  /** 목표 범위 밖에서 목표와 가장 많이 차이 난 지난 날. diff = 값 - 목표 (음수면 모자람) */
  furthest: { index: number; diff: number } | null;
}

/** 홈 주간 그래프 아래 한 줄 요약과 피드백. 날마다 그날 목표의 ±10% 로 본다. */
export function weeklySummary(s: WeeklySeries): WeeklySummary {
  const done = s.days.filter((d) => d.state === 'done' && d.current !== null);
  let furthest: WeeklySummary['furthest'] = null;
  let achieved = 0;
  for (const d of done) {
    const v = d.current as number;
    if (v >= d.target * (1 - BAND) && v <= d.target * (1 + BAND)) {
      achieved++;
      continue;
    }
    const diff = v - d.target;
    if (!furthest || Math.abs(diff) > Math.abs(furthest.diff)) furthest = { index: d.index, diff };
  }
  return { completed: done.length, achieved, furthest };
}
