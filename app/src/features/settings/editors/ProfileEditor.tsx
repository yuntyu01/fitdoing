import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Goal } from '../../../domain/targets';
import { NumberField } from '../../../ui/NumberField';
import { layout } from '../../../ui/tokens';
import { FormSection, RadioRow, TextField } from './Form';

export interface ProfileDraft {
  goal: Goal;
  height: string;
  weight: string;
}

/** 친구에게 보이는 이름. 앞뒤 공백은 저장할 때 지운다. */
export const NICKNAME_MAX = 20;
export const cleanNickname = (v: string) => v.trim().slice(0, NICKNAME_MAX);

export function isProfileValid(p: ProfileDraft): boolean {
  const h = Number(p.height);
  const w = Number(p.weight);
  return h >= 100 && h <= 250 && w >= 30 && w <= 300;
}

const GOALS: Goal[] = ['lose', 'keep', 'gain'];

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

/** 목표(하나 고르기) + 키·몸무게 (나란히) + 닉네임(선택) */
export function ProfileEditor({ value, onChange, goalTitle, bodyNote, nickname }: Props) {
  const { t } = useTranslation();
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
  fields: { flexDirection: 'row', gap: 12 },
  field: { flex: 1 },
});
