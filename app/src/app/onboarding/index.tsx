import { useTranslation } from 'react-i18next';

import { useOnboardingDraft } from '../../features/onboarding/draft';
import { onboardingFlow } from '../../features/onboarding/flow';
import { BodyGoalScreen, useStartForm } from '../../features/nutrition/routes';

export default function GoalStep() {
  const { t } = useTranslation();
  const settings = useOnboardingDraft((s) => s.settings);
  const set = useOnboardingDraft((s) => s.set);
  useStartForm(settings);

  // 닉네임은 친구에게 보이는 이름이라 선택. 비워 두면 설정에서 나중에 정한다. 저장할 때 앞뒤 공백을 지운다.
  return (
    <BodyGoalScreen
      flow={onboardingFlow}
      nickname={{
        value: settings.nickname,
        onChange: (v) => set({ nickname: v }),
        title: t('onboarding.nicknameOptional'),
      }}
    />
  );
}
