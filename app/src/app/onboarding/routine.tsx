import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { clampWeeklyTarget } from '../../domain/stats';
import { useOnboardingDraft } from '../../features/onboarding/draft';
import { ONBOARDING_STEPS } from '../../features/onboarding/flow';
import { FormNote } from '../../features/settings/editors/Form';
import { GymEditor, SleepEditor } from '../../features/settings/editors/RoutineEditors';
import { FullButton } from '../../ui/FullButton';
import { StepHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';

export default function RoutineStep() {
  const { t } = useTranslation();
  const gym = useOnboardingDraft((s) => s.settings.gym);
  const sleep = useOnboardingDraft((s) => s.settings.sleep);
  const set = useOnboardingDraft((s) => s.set);

  // 헬스를 켰다면 요일 하나 이상과 헬스장 위치가 있어야 한다.
  const gymOk = !gym.enabled || (gym.days.length > 0 && gym.lat !== null);

  return (
    <Screen
      header={<StepHeader step={6} total={ONBOARDING_STEPS} onBack={() => router.back()} />}
      title={t('onboarding.routineTitle')}
      footer={
        <FullButton
          label={t('common.next')}
          disabled={!gymOk}
          onPress={() => {
            set({ gym: { ...gym, weeklyTarget: clampWeeklyTarget(gym.weeklyTarget, gym.days.length) } });
            router.push('/onboarding/permissions');
          }}
        />
      }
    >
      <GymEditor value={gym} onChange={(g) => set({ gym: g })} />
      <SleepEditor value={sleep} onChange={(s) => set({ sleep: s })} />
      <FormNote>{t('onboarding.routineNote')}</FormNote>
    </Screen>
  );
}
