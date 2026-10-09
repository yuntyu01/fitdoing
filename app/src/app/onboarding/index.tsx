import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useOnboardingDraft } from '../../features/onboarding/draft';
import { cleanNickname, isProfileValid, ProfileEditor } from '../../features/settings/editors/ProfileEditor';
import { FullButton } from '../../ui/FullButton';
import { StepHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';

export default function GoalStep() {
  const { t } = useTranslation();
  const profile = useOnboardingDraft((s) => s.profile);
  const setProfile = useOnboardingDraft((s) => s.setProfile);
  const nickname = useOnboardingDraft((s) => s.settings.nickname);
  const set = useOnboardingDraft((s) => s.set);

  return (
    <Screen
      header={<StepHeader step={1} total={4} />}
      title={t('onboarding.goalTitle')}
      footer={
        <FullButton
          label={t('common.next')}
          disabled={!isProfileValid(profile)}
          onPress={() => {
            set({ nickname: cleanNickname(nickname) });
            router.push('/onboarding/meals');
          }}
        />
      }
    >
      {/* 닉네임은 친구에게 보이는 이름이라 선택. 비워 두면 설정에서 나중에 정한다. */}
      <ProfileEditor
        value={profile}
        onChange={setProfile}
        bodyNote={t('onboarding.changeLater')}
        nickname={{ value: nickname, onChange: (v) => set({ nickname: v }), title: t('onboarding.nicknameOptional') }}
      />
    </Screen>
  );
}
