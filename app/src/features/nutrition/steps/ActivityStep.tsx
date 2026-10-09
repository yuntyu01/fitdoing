import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  ACTIVITIES,
  PA,
  PAL_RANGE,
  type DailyActivity,
  type ExerciseType,
  type Intensity,
} from '../../../domain/nutrition';
import { NumberField } from '../../../ui/NumberField';
import { Segmented } from '../../../ui/Segmented';
import { layout } from '../../../ui/tokens';
import { FormNote, FormSection, RadioRow, Stepper } from '../../settings/editors/Form';
import { useForm, useNutritionForm } from '../form';

const DAILY: DailyActivity[] = ['sitting', 'standing', 'walking', 'manual'];
const EXERCISE: ExerciseType[] = ['none', 'strength', 'cardio', 'mixed', 'sports'];
const INTENSITY: Intensity[] = ['light', 'moderate', 'vigorous'];

/**
 * 2단계: 일상 활동·운동을 적고, 최종 신체활동단계는 사용자가 직접 고른다.
 * 운동 횟수만으로 단계를 정하는 검증된 환산표가 없어 자동으로 고르지 않는다.
 */
export function ActivityStep() {
  const { t } = useTranslation();
  const f = useForm();
  const set = useNutritionForm((s) => s.set);
  const ai = f.activityInput;
  const ex = ai.exercise;
  const setEx = (p: Partial<typeof ex>) => set({ ...f, activityInput: { ...ai, exercise: { ...ex, ...p } } });
  const paOf = (a: (typeof ACTIVITIES)[number]) =>
    f.sex ? String(PA[f.sex][a].toFixed(2)) : `${PA.male[a].toFixed(2)} / ${PA.female[a].toFixed(2)}`;

  return (
    <View style={styles.root}>
      <FormSection title={t('nutrition.dailyTitle')}>
        <View style={styles.list}>
          {DAILY.map((d) => (
            <RadioRow
              key={d}
              label={t(`nutrition.daily.${d}`)}
              selected={ai.daily === d}
              onPress={() => set({ ...f, activityInput: { ...ai, daily: d } })}
            />
          ))}
        </View>
      </FormSection>

      <FormSection title={t('nutrition.exerciseTitle')}>
        <View style={styles.list}>
          {EXERCISE.map((e) => (
            <RadioRow
              key={e}
              label={t(`nutrition.exercise.${e}`)}
              selected={ex.type === e}
              onPress={() =>
                e === 'none'
                  ? set({
                      ...f,
                      minutes: '',
                      activityInput: { ...ai, exercise: { type: 'none', perWeek: 0, minutes: 0, intensity: null } },
                    })
                  : setEx({ type: e })
              }
            />
          ))}
        </View>
        {ex.type !== 'none' ? (
          <View style={styles.fields}>
            <View style={styles.inline}>
              <FormNote>{t('nutrition.perWeek')}</FormNote>
              <Stepper
                value={ex.perWeek}
                min={0}
                max={14}
                onChange={(perWeek) => setEx({ perWeek })}
                label={t('nutrition.perWeekValue', { n: ex.perWeek })}
              />
            </View>
            <NumberField
              label={t('nutrition.minutes')}
              unit={t('nutrition.minuteUnit')}
              value={f.minutes}
              onChange={(minutes) => set({ ...f, minutes: minutes.replace(/\./g, '') })}
            />
            <FormNote>{t('nutrition.intensity')}</FormNote>
            <Segmented
              options={INTENSITY.map((v) => ({ value: v, label: t(`nutrition.intensityLevel.${v}`) }))}
              value={ex.intensity ?? ('' as Intensity)}
              onChange={(intensity) => setEx({ intensity })}
              height={44}
            />
          </View>
        ) : null}
      </FormSection>

      <FormSection title={t('nutrition.levelTitle')} note={t('nutrition.levelNote')}>
        <View style={styles.list}>
          {ACTIVITIES.map((a) => (
            <RadioRow
              key={a}
              label={t(`activity.${a}`)}
              desc={`${t(`activityDesc.${a}`)}\n${t('nutrition.levelMeta', { pal: PAL_RANGE[a], pa: paOf(a) })}`}
              selected={f.activity === a}
              onPress={() => set({ ...f, activity: a })}
            />
          ))}
        </View>
      </FormSection>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: layout.block + 8 },
  list: { gap: 4 },
  fields: { gap: 12, marginTop: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
