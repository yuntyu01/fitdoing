import type { TFunction } from 'i18next';

import { fromMinutes, splitDuration } from '../../domain/time';

/** 남은 시간: "20분", "1시간", "1시간 20분" */
export function formatRemaining(t: TFunction, ms: number): string {
  const { h, m } = splitDuration(ms / 60_000);
  if (h === 0) return t('common.minutes', { m });
  if (m === 0) return t('common.hours', { h });
  return t('common.hoursMinutes', { h, m });
}

/** Date -> 'HH:mm' */
export function hhmm(d: Date): string {
  return fromMinutes(d.getHours() * 60 + d.getMinutes());
}
