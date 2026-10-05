import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Goal } from '../../../domain/targets';
import { Card, Divider } from '../../../ui/Card';
import { NumberField } from '../../../ui/NumberField';
import { Segmented } from '../../../ui/Segmented';
import { space } from '../../../ui/tokens';

export interface ProfileDraft {
  goal: Goal;
  height: string;
  weight: string;
}

export function isProfileValid(p: ProfileDraft): boolean {
  const h = Number(p.height);
  const w = Number(p.weight);
  return h >= 100 && h <= 250 && w >= 30 && w <= 300;
}

export function ProfileEditor({ value, onChange }: { value: ProfileDraft; onChange: (v: ProfileDraft) => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: space.l }}>
      <Segmented<Goal>
        options={[
          { value: 'lose', label: t('goal.lose') },
          { value: 'keep', label: t('goal.keep') },
          { value: 'gain', label: t('goal.gain') },
        ]}
        value={value.goal}
        onChange={(goal) => onChange({ ...value, goal })}
      />
      <Card style={{ gap: space.m }}>
        <NumberField
          label={t('onboarding.height')}
          unit={t('onboarding.cm')}
          value={value.height}
          onChange={(height) => onChange({ ...value, height })}
        />
        <Divider />
        <NumberField
          label={t('onboarding.weight')}
          unit={t('onboarding.kg')}
          value={value.weight}
          onChange={(weight) => onChange({ ...value, weight })}
        />
      </Card>
    </View>
  );
}
