// 영양 수치는 추정값이라 반올림하고 "약"을 붙여 보여준다.

/** kcal은 10 단위, 그램은 1 단위로 반올림한다. 음수나 NaN은 0으로 본다. */
export function roundKcal(kcal: number): number {
  if (!Number.isFinite(kcal) || kcal <= 0) return 0;
  return Math.round(kcal / 10) * 10;
}

export function roundGram(g: number): number {
  if (!Number.isFinite(g) || g <= 0) return 0;
  return Math.round(g);
}

/** 1160 -> "1,160" (로케일 구분 기호). */
export function formatNumber(n: number, locale = 'ko-KR'): string {
  return n.toLocaleString(locale);
}

/** 추정 칼로리 표시: "약 1,160" */
export function approxKcal(kcal: number, prefix: string, locale = 'ko-KR'): string {
  return `${prefix} ${formatNumber(roundKcal(kcal), locale)}`;
}
