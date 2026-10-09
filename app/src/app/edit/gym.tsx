import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { clampWeeklyTarget } from '../../domain/stats';
import { GymEditor } from '../../features/settings/editors/RoutineEditors';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';

export default function EditGym() {
  const { t } = useTranslation();
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const [gym, setGym] = useState(s.gym);
  const ok = !gym.enabled || (gym.days.length > 0 && gym.lat !== null);

  return (
    <Screen
      header={<SubHeader title={t('settings.gym')} onBack={() => router.back()} />}
      footer={
        <FullButton
          label={t('edit.save')}
          disabled={!ok}
          onPress={() => {
            update({ gym: { ...gym, weeklyTarget: clampWeeklyTarget(gym.weeklyTarget, gym.days.length) } });
            router.back();
          }}
        />
      }
    >
      <GymEditor value={gym} onChange={setGym} title={t('edit.gymEnabled')} />
    </Screen>
  );
}
