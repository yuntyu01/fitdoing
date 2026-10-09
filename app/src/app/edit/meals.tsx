import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MealsEditor } from '../../features/settings/editors/MealsEditor';
import { askToEnableNotifications } from '../../features/settings/notifications';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';

export default function EditMeals() {
  const { t } = useTranslation();
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const [meals, setMeals] = useState(s.meals);
  const [notifications, setNotifications] = useState(s.notifications);

  // 켤 때 알림 권한이 없으면 묻는다. 허용하지 않으면 꺼진 채로 둔다.
  const toggleNotifications = async (on: boolean) => {
    if (on && !(await askToEnableNotifications())) return;
    setNotifications(on);
  };

  return (
    <Screen
      header={<SubHeader title={t('settings.meals')} onBack={() => router.back()} />}
      footer={
        <FullButton
          label={t('edit.save')}
          onPress={() => {
            update({ meals, notifications });
            router.back();
          }}
        />
      }
    >
      <MealsEditor
        value={meals}
        onChange={setMeals}
        notifications={notifications}
        onNotificationsChange={(on) => void toggleNotifications(on)}
      />
    </Screen>
  );
}
