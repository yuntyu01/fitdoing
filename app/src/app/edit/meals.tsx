import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MealsEditor } from '../../features/settings/editors/MealsEditor';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';

export default function EditMeals() {
  const { t } = useTranslation();
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const [meals, setMeals] = useState(s.meals);

  return (
    <Screen
      header={<SubHeader title={t('settings.meals')} onBack={() => router.back()} />}
      footer={
        <FullButton
          label={t('common.save')}
          onPress={() => {
            update({ meals });
            router.back();
          }}
        />
      }
    >
      <MealsEditor value={meals} onChange={setMeals} />
    </Screen>
  );
}
