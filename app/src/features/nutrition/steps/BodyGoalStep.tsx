import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Eligibility } from '../../../domain/nutrition';
import { ListRow } from '../../../ui/ListRow';
import { Toggle } from '../../../ui/Toggle';
import { layout } from '../../../ui/tokens';
import { FormSection, Rows } from '../../settings/editors/Form';
import { ProfileEditor } from '../../settings/editors/ProfileEditor';
import { switchGoal, useForm, useNutritionForm } from '../form';

const SPECIAL: (keyof Eligibility)[] = ['pregnant', 'lactating', 'medicalDiet'];

/** 1단계: 목표 + 신체 정보 + 일반 자동 계산 대상인지 */
export function BodyGoalStep({
  goalTitle,
  nickname,
}: {
  goalTitle?: string;
  nickname?: { value: string; onChange: (v: string) => void; title: string };
}) {
  const { t } = useTranslation();
  const f = useForm();
  const set = useNutritionForm((s) => s.set);
  return (
    <View style={styles.root}>
      <ProfileEditor
        value={{ goal: f.goal, sex: f.sex, age: f.age, height: f.height, weight: f.weight }}
        onChange={(p) => set({ ...switchGoal(f, p.goal), sex: p.sex, age: p.age, height: p.height, weight: p.weight })}
        goalTitle={goalTitle}
        bodyNote={t('nutrition.bodyNote')}
        nickname={nickname}
      />
      <FormSection title={t('nutrition.scopeTitle')} note={t('nutrition.scopeNote')}>
        <Rows>
          {SPECIAL.map((k) => (
            <ListRow
              key={k}
              label={t(`nutrition.special.${k}`)}
              right={
                <Toggle
                  value={f.eligibility[k]}
                  onChange={(v) => set({ ...f, eligibility: { ...f.eligibility, [k]: v } })}
                />
              }
            />
          ))}
        </Rows>
      </FormSection>
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: layout.block + 8 } });
