// 시각·날짜 계산. 모두 기기 로컬 시간대 기준.

/** 'HH:mm' -> 하루 중 분 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 하루 중 분 -> 'HH:mm' (24시간을 넘으면 감아서) */
export function fromMinutes(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Date -> 'YYYY-MM-DD' */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' -> 그날 00:00 Date */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 그날 00:00 + 분 (1440 이상이면 다음 날로 넘어간다) */
export function atMinutes(day: Date, min: number): Date {
  const r = startOfDay(day);
  r.setMinutes(min);
  return r;
}

/** 0=월 ... 6=일 */
export function weekdayMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** 그 주 월요일의 dateKey. 쿠폰·헬스 주간 집계의 키. */
export function weekKey(d: Date): string {
  return dateKey(addDays(startOfDay(d), -weekdayMon0(d)));
}

/** 남은 분을 시·분으로 나눈다. 음수는 0. */
export function splitDuration(totalMin: number): { h: number; m: number } {
  const t = Math.max(0, Math.ceil(totalMin));
  return { h: Math.floor(t / 60), m: t % 60 };
}
