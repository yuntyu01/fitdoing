import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useOnboardingDraft } from '../../features/onboarding/draft';
import { GymEditor, SleepEditor } from '../../features/settings/editors/RoutineEditors';
import { FullButton } from '../../ui/FullButton';
import { StepHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';
import { type } from '../../ui/tokens';

export default function RoutineStep() {
  const { t } = useTranslation();
  const gym = useOnboardingDraft((s) => s.settings.gym);
  const sleep = useOnboardingDraft((s) => s.settings.sleep);
  const set = useOnboardingDraft((s) => s.set);

  // 헬스를 켰다면 요일 하나 이상과 헬스장 위치가 있어야 한다.
  const gymOk = !gym.enabled || (gym.days.length > 0 && gym.lat !== null);

  return (
    <Screen
      header={<StepHeader title={t('app.name')} step={3} total={3} onBack={() => router.back()} />}
      title={t('onboarding.routineTitle')}
      footer={
        <FullButton
          label={t('onboarding.routineStart')}
          disabled={!gymOk}
          onPress={() => router.push('/onboarding/permissions')}
        />
      }
    >
      <GymEditor value={gym} onChange={(g) => set({ gym: g })} />
      <SleepEditor value={sleep} onChange={(s) => set({ sleep: s })} />
      <Text style={[type.note, { textAlign: 'center' }]}>{t('onboarding.routineCaption')}</Text>
    </Screen>
  );
}
