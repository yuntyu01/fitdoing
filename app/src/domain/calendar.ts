import { dateKey } from './time';

export interface YearMonth {
  year: number;
  month: number; // 0~11
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const d = new Date(ym.year, ym.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function monthOf(d: Date): YearMonth {
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function sameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** 그 달 첫날·마지막날의 dateKey (문자열 비교로 범위 조회에 쓴다) */
export function monthRange(ym: YearMonth): { start: string; end: string } {
  return {
    start: dateKey(new Date(ym.year, ym.month, 1)),
    end: dateKey(new Date(ym.year, ym.month + 1, 0)),
  };
}

/**
 * 월~일 7열 달력 격자. 날짜가 아닌 칸은 null.
 * 마지막 주도 7칸을 채워서 돌려준다.
 */
export function monthGrid(ym: YearMonth): (string | null)[][] {
  const first = new Date(ym.year, ym.month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(ym.year, ym.month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(dateKey(new Date(ym.year, ym.month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 하루 기록 사실. 서버 /api/records/month 의 한 날과 같은 의미. */
export interface DayFacts {
  date: string;
  mealsLogged: number;
  mealsPlanned: number;
  locked: boolean; // 그날 잠금이 한 번이라도 걸렸다
  gym: boolean; // 헬스 인증(위치·사진·휴식권 모두)
  sleep: boolean; // 취침 기록
}

export type DayState = 'full' | 'partial' | 'none';

/** 다 찍음 = 계획한 끼니를 모두 기록. 하나라도 있으면 일부. */
export function dayState(f: Pick<DayFacts, 'mealsLogged' | 'mealsPlanned'>): DayState {
  if (f.mealsLogged <= 0) return 'none';
  return f.mealsLogged >= f.mealsPlanned ? 'full' : 'partial';
}

export interface MonthSummary {
  full: number;
  locked: number;
  gym: number;
}

export function monthSummary(facts: DayFacts[]): MonthSummary {
  let full = 0;
  let locked = 0;
  let gym = 0;
  for (const f of facts) {
    if (dayState(f) === 'full') full++;
    if (f.locked) locked++;
    if (f.gym) gym++;
  }
  return { full, locked, gym };
}

/** 기록이 하나도 없는 달인지 */
export function isEmptyMonth(facts: DayFacts[]): boolean {
  return facts.every((f) => f.mealsLogged === 0 && !f.locked && !f.gym && !f.sleep);
}
