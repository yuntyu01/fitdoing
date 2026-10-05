import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useOnboardingDraft } from '../../features/onboarding/draft';
import { MealsEditor } from '../../features/settings/editors/MealsEditor';
import { FullButton } from '../../ui/FullButton';
import { StepHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';
import { type } from '../../ui/tokens';

export default function MealsStep() {
  const { t } = useTranslation();
  const meals = useOnboardingDraft((s) => s.settings.meals);
  const set = useOnboardingDraft((s) => s.set);

  return (
    <Screen
      header={<StepHeader title={t('app.name')} step={2} total={3} onBack={() => router.back()} />}
      title={t('onboarding.mealsTitle')}
      desc={t('onboarding.mealsDesc')}
      footer={<FullButton label={t('common.next')} onPress={() => router.push('/onboarding/routine')} />}
    >
      <MealsEditor value={meals} onChange={(m) => set({ meals: m })} />
      <Text style={[type.note, { textAlign: 'center' }]}>{t('onboarding.mealsCaption')}</Text>
    </Screen>
  );
}
