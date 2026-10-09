import type { TFunction } from 'i18next';

import { autoBlocks, type CalcResult } from '../../../domain/nutrition';
import { formatNumber } from '../../../domain/format';
import { MIN_KCAL } from '../../../domain/targets';
import { bodyOf, type NutritionForm } from '../form';

/** 계산 오류를 사용자가 고칠 수 있는 문장으로 */
export function calcErrorText(t: TFunction, f: NutritionForm, r: CalcResult): string | null {
  if (r.ok) return null;
  switch (r.error) {
    case 'autoBlocked':
      return autoBlocks(bodyOf(f), f.eligibility)
        .map((b) => t(`nutrition.block.${b}`))
        .join('\n');
    case 'ratioSum':
      return t('nutrition.err.ratioSum');
    case 'negativeRemainder': {
      const neg = (['carbs', 'protein', 'fat'] as const).find((m) => (r.calc[m] ?? 0) < 0);
      return t('nutrition.err.negative', { macro: neg ? t(`macro.${neg}`) : '' });
    }
    case 'belowMin':
      // 자동 추천은 이 범위 아래 목표를 내지 않고, 직접 설정도 이 앱에서는 이 범위까지만 지원한다(앱 정책)
      return t(f.mode === 'custom' ? 'nutrition.err.belowMinCustom' : 'nutrition.err.belowMinAuto', {
        min: formatNumber(MIN_KCAL),
      });
    case 'carbOverKcal':
      return t('nutrition.err.carbOverKcal');
    default:
      return t('nutrition.err.invalid');
  }
}

/** 화면 표시용 반올림: g 은 소수 첫째 자리까지, kcal 은 정수 */
export function oneDecimal(v: number): string {
  const r = Math.round(v * 10) / 10;
  const [i, d] = Math.abs(r).toFixed(1).split('.');
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${r < 0 ? '-' : ''}${int}${d === '0' ? '' : `.${d}`}`;
}
export const showGram = oneDecimal;
export const showPct = oneDecimal;
export const showKcal = (v: number) => formatNumber(v);
