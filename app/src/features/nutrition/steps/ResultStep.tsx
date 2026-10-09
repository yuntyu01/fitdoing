import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import {
  AMDR,
  calculate,
  goalAdjust,
  GOAL_ADJUST_START,
  MACROS,
  outsideAmdr,
  PA,
  toTargets,
  type CalcResult,
} from '../../../domain/nutrition';
import { formatNumber } from '../../../domain/format';
import type { Targets } from '../../../domain/targets';
import { ListRow } from '../../../ui/ListRow';
import { useThemedStyles, type Palette } from '../../../ui/theme';
import { layout, text } from '../../../ui/tokens';
import { FormNote, FormSection, Rows } from '../../settings/editors/Form';
import { calcInputOf, useForm, type NutritionForm } from '../form';
import { calcErrorText, oneDecimal, showGram, showKcal, showPct } from './messages';

function useCalc(): { f: NutritionForm; result: CalcResult } {
  const f = useForm();
  return { f, result: calculate(calcInputOf(f)) };
}

const signed = (v: number) => (v > 0 ? `+${v}%` : `${v}%`);

/** 4단계: 유지 칼로리 추정과 목표 칼로리를 나눠 보여주고, 바뀌기 전후를 비교한다. 적용 버튼은 화면(route)에 있다. */
export function ResultStep({ before }: { before: Targets | null }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { f, result } = useCalc();
  const err = calcErrorText(t, f, result);
  const kcalUnit = t('common.kcal');
  const g = t('common.gram');

  if (!result.ok) {
    return (
      <FormSection title={t('nutrition.resultError')}>
        <Text style={styles.error}>{err}</Text>
      </FormSection>
    );
  }
  const c = result.calc;
  const after = toTargets(c);
  const outside = outsideAmdr(c.percent);
  const adj = goalAdjust({ goalAdjustPct: f.goalAdjust }, f.goal);
  const isStart = f.goalAdjust === null || f.goalAdjust === GOAL_ADJUST_START[f.goal];

  return (
    <View style={styles.root}>
      {c.maintenance !== null && f.mode !== 'custom' ? (
        <FormSection title={t('nutrition.kcalTitle')}>
          <Rows>
            <ListRow
              label={t('nutrition.maintenance')}
              desc={t('nutrition.maintenanceDesc', {
                level: t(`activity.${f.activity!}`),
                pa: PA[f.sex!][f.activity!].toFixed(2),
              })}
              value={`${t('common.approx')} ${showKcal(c.maintenance)} ${kcalUnit}`}
            />
            <ListRow
              label={t('nutrition.adjusted', { adj: signed(adj) })}
              desc={t(isStart ? 'nutrition.adjustedStart' : 'nutrition.adjustedEdited')}
              value={`${oneDecimal(c.adjusted!)} ${kcalUnit}`}
            />
            <ListRow
              label={t('nutrition.target')}
              desc={t('nutrition.targetDesc')}
              value={`${showKcal(c.kcal)} ${kcalUnit}`}
              labelBold
            />
          </Rows>
          <FormNote>{t('nutrition.noExerciseAdd')}</FormNote>
        </FormSection>
      ) : (
        <FormSection title={t('nutrition.kcalTitle')}>
          <Rows>
            <ListRow label={t('nutrition.target')} value={`${showKcal(c.kcal)} ${kcalUnit}`} labelBold />
            {c.maintenance !== null ? (
              <ListRow
                label={t('nutrition.maintenanceRef')}
                value={`${t('common.approx')} ${showKcal(c.maintenance)} ${kcalUnit}`}
              />
            ) : null}
          </Rows>
          <FormNote>{t('nutrition.customKcalNote')}</FormNote>
        </FormSection>
      )}

      <FormSection title={t('nutrition.macroTitle')} note={t('nutrition.macroNote')}>
        <Rows>
          {MACROS.map((m, i) => (
            <ListRow
              key={m}
              label={t(`macro.${m}`)}
              desc={
                m === 'protein' && c.proteinPerKg > 0
                  ? t('nutrition.perKg', { v: String(Math.round(c.proteinPerKg * 100) / 100) })
                  : undefined
              }
              value={`${showGram(c[m])}${g} · ${showPct(c.percent[i])}%`}
            />
          ))}
        </Rows>
      </FormSection>

      <FormSection title={t('nutrition.amdrTitle')}>
        <FormNote>
          {t('nutrition.amdrRange', {
            c: AMDR.carbs.join('–'),
            p: AMDR.protein.join('–'),
            f: AMDR.fat.join('–'),
          })}
        </FormNote>
        {outside.length > 0 ? (
          <FormNote>{t('nutrition.amdrOutside', { names: outside.map((m) => t(`macro.${m}`)).join(', ') })}</FormNote>
        ) : null}
        {f.carb.kind === 'keto' && f.mode !== 'custom' ? <FormNote>{t('nutrition.ketoNote')}</FormNote> : null}
      </FormSection>

      <FormSection title={t('nutrition.compareTitle')} note={before ? undefined : t('nutrition.compareFirst')}>
        <Rows>
          {(['kcal', ...MACROS] as const).map((k) => (
            <ListRow
              key={k}
              label={k === 'kcal' ? t('settings.kcal') : t(`macro.${k}`)}
              value={`${before ? `${formatNumber(before[k])} → ` : ''}${formatNumber(after[k])}${k === 'kcal' ? ` ${kcalUnit}` : g}`}
            />
          ))}
        </Rows>
      </FormSection>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { gap: layout.block + 8 },
    error: { ...text.body, color: c.text },
  });
