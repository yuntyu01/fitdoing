import { addDays, dateKey, startOfDay } from './time';

/** 폰에 끼니 사진을 며칠 둘지. null 은 계속 보관(기본) */
export const PHOTO_KEEP_OPTIONS = [null, 30, 90, 180] as const;

/** 보관 기간이 지난 날의 사진만 고른다. 오늘부터 keepDays 일 전까지는 남긴다. */
export function photosToPurge<T extends { date: string; photoUri: string | null }>(
  rows: T[],
  keepDays: number | null,
  now: Date,
): T[] {
  if (keepDays === null) return [];
  const cutoff = dateKey(addDays(startOfDay(now), -keepDays));
  return rows.filter((r) => r.photoUri && r.date < cutoff);
}
