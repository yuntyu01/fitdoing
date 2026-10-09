import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useOnboardingDraft } from '../../features/onboarding/draft';
import { MealsEditor } from '../../features/settings/editors/MealsEditor';
import { askToEnableNotifications } from '../../features/settings/notifications';
import { FullButton } from '../../ui/FullButton';
import { StepHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';

export default function MealsStep() {
  const { t } = useTranslation();
  const meals = useOnboardingDraft((s) => s.settings.meals);
  const notifications = useOnboardingDraft((s) => s.settings.notifications);
  const set = useOnboardingDraft((s) => s.set);

  // 껐다가 다시 켤 때 권한이 없으면 묻는다. 기본(켜짐) 그대로면 마지막 화면의 "시작하기"에서 묻는다.
  const toggleNotifications = async (on: boolean) => {
    if (on && !(await askToEnableNotifications())) return;
    set({ notifications: on });
  };

  return (
    <Screen
      header={<StepHeader step={2} total={4} onBack={() => router.back()} />}
      title={t('onboarding.mealsTitle')}
      footer={<FullButton label={t('common.next')} onPress={() => router.push('/onboarding/routine')} />}
    >
      <MealsEditor
        value={meals}
        onChange={(m) => set({ meals: m })}
        notifications={notifications}
        onNotificationsChange={(on) => void toggleNotifications(on)}
      />
    </Screen>
  );
}
