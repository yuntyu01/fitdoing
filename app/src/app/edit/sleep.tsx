import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SleepEditor } from '../../features/settings/editors/RoutineEditors';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';

export default function EditSleep() {
  const { t } = useTranslation();
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const [sleep, setSleep] = useState(s.sleep);

  return (
    <Screen
      header={<SubHeader title={t('settings.sleep')} onBack={() => router.back()} />}
      footer={
        <FullButton
          label={t('edit.save')}
          onPress={() => {
            update({ sleep });
            router.back();
          }}
        />
      }
    >
      <SleepEditor value={sleep} onChange={setSleep} title={t('edit.sleepEnabled')} />
    </Screen>
  );
}
