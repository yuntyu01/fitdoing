import type { TFunction } from 'i18next';

import { formatNumber } from '../../domain/format';
import type { Nutrition } from './types';

/** 올린 지 얼마나 됐는지: "방금", "12분 전", "1시간 전", "2일 전" */
export function timeAgo(t: TFunction, iso: string, now: number = Date.now()): string {
  const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 1) return t('friends.justNow');
  if (min < 60) return t('friends.minutesAgo', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('friends.hoursAgo', { n: h });
  return t('friends.daysAgo', { n: Math.floor(h / 24) });
}

/** "520 kcal" */
export const kcalText = (t: TFunction, n: Nutrition) => t('friends.kcal', { n: formatNumber(n.kcal) });

/** "탄 60g · 단 30g · 지 18g" */
export const macrosText = (t: TFunction, n: Nutrition) =>
  t('friends.macros', { c: formatNumber(n.carbs), p: formatNumber(n.protein), f: formatNumber(n.fat) });

/** ISO 시각 → 내 폰 기준 'HH:mm' */
export function clockText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
