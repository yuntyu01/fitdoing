import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useOnboardingDraft } from '../../features/onboarding/draft';
import { isProfileValid, ProfileEditor } from '../../features/settings/editors/ProfileEditor';
import { Card } from '../../ui/Card';
import { FullButton } from '../../ui/FullButton';
import { StepHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';
import { fonts, space, type } from '../../ui/tokens';

export default function GoalStep() {
  const { t } = useTranslation();
  const profile = useOnboardingDraft((s) => s.profile);
  const setProfile = useOnboardingDraft((s) => s.setProfile);

  return (
    <Screen
      header={<StepHeader title={t('app.name')} step={1} total={3} />}
      title={t('onboarding.goalTitle')}
      desc={t('onboarding.goalDesc')}
      footer={
        <FullButton
          label={t('common.next')}
          disabled={!isProfileValid(profile)}
          onPress={() => router.push('/onboarding/meals')}
        />
      }
    >
      <ProfileEditor value={profile} onChange={setProfile} />
      <Card style={{ gap: space.s + 4, padding: space.l, paddingVertical: space.l + 4 }}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 18 }}>{t('onboarding.noteTitle')}</Text>
        <Text style={type.note}>{t('onboarding.noteBody')}</Text>
      </Card>
    </Screen>
  );
}
