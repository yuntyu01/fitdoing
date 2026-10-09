import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  autoBlocks,
  GOAL_ADJUST_MAX,
  GOAL_ADJUST_MIN,
  GOAL_ADJUST_START,
  MACROS,
  RATIO_PRESETS,
  type Macro,
  type PlanMode,
} from '../../../domain/nutrition';
import { NumberField } from '../../../ui/NumberField';
import { Segmented } from '../../../ui/Segmented';
import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, text } from '../../../ui/tokens';
import { FormNote, FormSection, RadioRow, Stepper } from '../../settings/editors/Form';
import {
  bodyOf,
  goalAdjustOf,
  switchCarb,
  switchCustomKind,
  switchMode,
  useForm,
  useNutritionForm,
  type CarbKind,
  type CustomKind,
} from '../form';

const MODES: PlanMode[] = ['balanced', 'training', 'custom'];
const CARBS: CarbKind[] = ['none', 'lowCarb', 'lchf', 'keto'];
const signed = (v: number) => (v > 0 ? `+${v}%` : `${v}%`);

/** % 세 칸(탄·단·지)과 합계 안내 */
function PercentFields({
  value,
  onChange,
}: {
  value: [string, string, string];
  onChange: (v: [string, string, string]) => void;
}) {
  const { t } = useTranslation();
  const sum = value.reduce((s, v) => s + (Number(v) || 0), 0);
  return (
    <View style={styles.fields}>
      <View style={styles.row}>
        {MACROS.map((m, i) => (
          <View key={m} style={styles.field}>
            <NumberField
              compact
              label={t(`macro.${m}`)}
              unit="%"
              value={value[i]}
              onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)) as [string, string, string])}
            />
          </View>
        ))}
      </View>
      <FormNote>{t('nutrition.ratioSum', { sum: Math.round(sum * 100) / 100 })}</FormNote>
    </View>
  );
}

/** 3단계: 계산 모드. 기본으로는 세 모드만 보이고 탄수 제한(저탄수·저탄고지·케토)은 접어 둔다. */
export function PlanStep() {
  const { t } = useTranslation();
  const c = usePalette();
  const themed = useThemedStyles(makeStyles);
  const f = useForm();
  const set = useNutritionForm((s) => s.set);
  const [advanced, setAdvanced] = useState(f.carb.kind !== 'none');
  const blocked = autoBlocks(bodyOf(f), f.eligibility).length > 0;
  const adj = goalAdjustOf(f);
  const cu = f.custom;

  return (
    <View style={styles.root}>
      <FormSection title={t('nutrition.modeTitle')} note={blocked ? t('nutrition.modeBlocked') : undefined}>
        <View style={styles.list}>
          {MODES.map((m) => (
            <RadioRow
              key={m}
              label={t(`nutrition.mode.${m}`)}
              desc={t(`nutrition.modeDesc.${m}`)}
              selected={f.mode === m}
              disabled={blocked && m !== 'custom'}
              onPress={() => set(switchMode(f, m, Number(cu.kcal) || 0))}
            />
          ))}
        </View>
      </FormSection>

      {f.mode !== 'custom' ? (
        <FormSection
          title={t('nutrition.adjustTitle')}
          note={t('nutrition.adjustNote', { start: signed(GOAL_ADJUST_START[f.goal]), goal: t(`goal.${f.goal}`) })}
        >
          <View style={styles.inline}>
            <Text style={themed.label}>{t(`goal.${f.goal}`)}</Text>
            <Stepper
              value={adj}
              min={GOAL_ADJUST_MIN}
              max={GOAL_ADJUST_MAX}
              step={5}
              onChange={(v) => set({ ...f, goalAdjust: v })}
              label={signed(adj)}
            />
          </View>
        </FormSection>
      ) : null}

      {f.mode === 'balanced' ? (
        <FormSection title={t('nutrition.balancedTitle')} note={t('nutrition.balancedNote')}>
          <PercentFields value={f.balanced} onChange={(balanced) => set({ ...f, balanced })} />
        </FormSection>
      ) : null}

      {f.mode === 'training' ? (
        <FormSection title={t('nutrition.trainingTitle')} note={t('nutrition.trainingNote')}>
          <View style={styles.row}>
            <View style={styles.field}>
              <NumberField
                label={t('nutrition.proteinPerKg')}
                unit="g/kg"
                value={f.training.ppk}
                onChange={(ppk) => set({ ...f, training: { ...f.training, ppk } })}
              />
            </View>
            <View style={styles.field}>
              <NumberField
                label={t('nutrition.fatPct')}
                unit="%"
                value={f.training.fatPct}
                onChange={(fatPct) => set({ ...f, training: { ...f.training, fatPct } })}
              />
            </View>
          </View>
        </FormSection>
      ) : null}

      {f.mode === 'custom' ? (
        <FormSection title={t('nutrition.customTitle')}>
          <View style={styles.fields}>
            <Segmented
              options={(['ratio', 'fixKcal', 'grams'] as CustomKind[]).map((k) => ({
                value: k,
                label: t(`nutrition.customKind.${k}`),
              }))}
              value={cu.kind}
              onChange={(k) => set(switchCustomKind(f, k))}
              height={44}
            />
            <FormNote>{t(`nutrition.customDesc.${cu.kind}`)}</FormNote>
            {cu.kind !== 'grams' ? (
              <NumberField
                label={t('settings.kcal')}
                unit={t('common.kcal')}
                value={cu.kcal}
                onChange={(kcal) => set({ ...f, custom: { ...cu, kcal } })}
              />
            ) : null}
            {cu.kind === 'ratio' ? (
              <>
                <Segmented
                  options={RATIO_PRESETS.map((p) => ({ value: p.key, label: t(`ratio.${p.key}`) }))}
                  value={
                    RATIO_PRESETS.find((p) => p.ratio.every((v, i) => Number(cu.ratio[i]) === v))?.key ?? ('' as 'r532')
                  }
                  onChange={(k) => {
                    const p = RATIO_PRESETS.find((x) => x.key === k)!;
                    set({ ...f, custom: { ...cu, ratio: p.ratio.map(String) as [string, string, string] } });
                  }}
                  height={44}
                />
                <PercentFields value={cu.ratio} onChange={(ratio) => set({ ...f, custom: { ...cu, ratio } })} />
              </>
            ) : null}
            {cu.kind === 'fixKcal' ? (
              <>
                <FormNote>{t('nutrition.solveTitle')}</FormNote>
                <Segmented
                  options={MACROS.map((m) => ({ value: m, label: t(`macro.${m}`) }))}
                  value={cu.solve}
                  onChange={(solve: Macro) =>
                    set({ ...f, custom: { ...cu, solve, grams: { ...cu.grams, [solve]: '' } } })
                  }
                  height={44}
                />
              </>
            ) : null}
            {cu.kind !== 'ratio' ? (
              <View style={styles.row}>
                {MACROS.filter((m) => cu.kind === 'grams' || m !== cu.solve).map((m) => (
                  <View key={m} style={styles.field}>
                    <NumberField
                      compact
                      label={t(`macro.${m}`)}
                      unit={t('common.gram')}
                      value={cu.grams[m]}
                      onChange={(v) => set({ ...f, custom: { ...cu, grams: { ...cu.grams, [m]: v } } })}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </FormSection>
      ) : null}

      {f.mode !== 'custom' ? (
        <View style={styles.list}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: advanced }}
            onPress={() => setAdvanced((v) => !v)}
            style={styles.foldHead}
          >
            <Text style={themed.foldTitle}>{t('nutrition.advancedTitle')}</Text>
            {advanced ? <ChevronUp size={18} color={c.sub} /> : <ChevronDown size={18} color={c.sub} />}
          </Pressable>
          {advanced ? (
            <View style={styles.fields}>
              <FormNote>{t('nutrition.advancedNote')}</FormNote>
              <View style={styles.list}>
                {CARBS.map((k) => (
                  <RadioRow
                    key={k}
                    label={t(`nutrition.carb.${k}`)}
                    desc={k === 'none' ? undefined : t(`nutrition.carbDesc.${k}`)}
                    selected={f.carb.kind === k}
                    onPress={() => set(switchCarb(f, k))}
                  />
                ))}
              </View>
              {f.carb.kind === 'lowCarb' || f.carb.kind === 'lchf' ? (
                <>
                  <Segmented
                    options={[
                      { value: 'pct' as const, label: t('nutrition.carbByPct') },
                      { value: 'grams' as const, label: t('nutrition.carbByGrams') },
                    ]}
                    value={f.carb.by}
                    onChange={(by) => set({ ...f, carb: { ...f.carb, by, value: '' } })}
                    height={44}
                  />
                  <NumberField
                    label={t('nutrition.carbTarget')}
                    unit={f.carb.by === 'pct' ? '%' : t('common.gram')}
                    value={f.carb.value}
                    onChange={(value) => set({ ...f, carb: { ...f.carb, value } })}
                  />
                </>
              ) : null}
              {f.carb.kind === 'keto' ? (
                <>
                  <NumberField
                    label={t('nutrition.ketoTarget')}
                    unit={t('common.gram')}
                    value={f.carb.value}
                    onChange={(value) => set({ ...f, carb: { ...f.carb, value } })}
                  />
                  <FormNote>{t('nutrition.ketoNote')}</FormNote>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: layout.block + 8 },
  list: { gap: 4 },
  fields: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  foldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    label: { ...text.label, color: c.text },
    foldTitle: { ...text.heading, fontFamily: fonts.semibold, color: c.text },
  });
