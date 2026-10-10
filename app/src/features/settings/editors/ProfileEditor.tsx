import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Sex } from '../../../domain/nutrition';
import type { Goal } from '../../../domain/targets';
import { NumberField } from '../../../ui/NumberField';
import { Segmented } from '../../../ui/Segmented';
import { layout } from '../../../ui/tokens';
import { FormSection, RadioRow, TextField } from './Form';

/** 목표와 신체 정보. 숫자 칸은 입력 중인 글자 그대로. 성별·나이는 모르면 비워 둔다(null · ''). */
export interface ProfileDraft {
  goal: Goal;
  sex: Sex | null;
  age: string;
  height: string;
  weight: string;
}

/** 친구에게 보이는 이름. 앞뒤 공백은 저장할 때 지운다. */
export const NICKNAME_MAX = 20;
export const cleanNickname = (v: string) => v.trim().slice(0, NICKNAME_MAX);

/** 키·몸무게는 필수, 나이는 비워도 되지만 넣으면 10~100 정수 */
export function isProfileValid(p: ProfileDraft): boolean {
  const h = Number(p.height);
  const w = Number(p.weight);
  const a = Number(p.age);
  const ageOk = p.age.trim() === '' || (Number.isInteger(a) && a >= 10 && a <= 100);
  return h >= 100 && h <= 250 && w >= 30 && w <= 300 && ageOk;
}

export const ageOf = (p: ProfileDraft): number | null => (p.age.trim() === '' ? null : Number(p.age));

const GOALS: Goal[] = ['lose', 'keep', 'gain', 'bulk'];

interface Props {
  value: ProfileDraft;
  onChange: (v: ProfileDraft) => void;
  /** 목표 목록 위 소제목. 온보딩은 화면 제목이 그 역할이라 비워 둔다. */
  goalTitle?: string;
  /** 신체 정보 아래 안내 */
  bodyNote?: string;
  /** 닉네임 칸. 넘기면 신체 정보 아래에 둔다. */
  nickname?: { value: string; onChange: (v: string) => void; title: string };
}

/** 목표(하나 고르기) + 성별 + 키·몸무게(한 줄) + 나이(다음 줄) + 닉네임(선택) */
export function ProfileEditor({ value, onChange, goalTitle, bodyNote, nickname }: Props) {
  const { t } = useTranslation();
  // 성별은 남성·여성 중 고른다. 아직 안 골랐으면(null) 둘 다 꺼진 채로 둔다(그때는 직접 설정만 쓸 수 있다).
  const sexOptions: { value: Sex; label: string }[] = [
    { value: 'male', label: t('sex.male') },
    { value: 'female', label: t('sex.female') },
  ];
  return (
    <View style={styles.root}>
      <FormSection title={goalTitle}>
        <View style={styles.goals}>
          {GOALS.map((g) => (
            <RadioRow
              key={g}
              label={t(`goal.${g}`)}
              selected={value.goal === g}
              onPress={() => onChange({ ...value, goal: g })}
            />
          ))}
        </View>
      </FormSection>
      <FormSection title={t('edit.body')} note={bodyNote}>
        <View style={styles.fields}>
          <Segmented
            options={sexOptions}
            value={value.sex ?? ('' as Sex)}
            onChange={(sex) => onChange({ ...value, sex })}
          />
          <View style={styles.row}>
            <View style={styles.field}>
              <NumberField
                label={t('onboarding.height')}
                unit={t('onboarding.cm')}
                value={value.height}
                onChange={(height) => onChange({ ...value, height })}
              />
            </View>
            <View style={styles.field}>
              <NumberField
                label={t('onboarding.weight')}
                unit={t('onboarding.kg')}
                value={value.weight}
                onChange={(weight) => onChange({ ...value, weight })}
              />
            </View>
          </View>
          <NumberField
            label={t('onboarding.age')}
            unit={t('onboarding.ageUnit')}
            value={value.age}
            onChange={(age) => onChange({ ...value, age: age.replace(/\./g, '') })}
          />
        </View>
      </FormSection>
      {nickname ? (
        <FormSection title={nickname.title} note={t('edit.nicknameNote')}>
          <TextField
            value={nickname.value}
            onChange={nickname.onChange}
            placeholder={t('edit.nicknamePlaceholder')}
            maxLength={NICKNAME_MAX}
            accessibilityLabel={nickname.title}
          />
        </FormSection>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: layout.block + 8 },
  goals: { gap: 4 },
  fields: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, minWidth: 0 },
});
