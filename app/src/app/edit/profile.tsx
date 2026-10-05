import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isProfileValid, ProfileEditor, type ProfileDraft } from '../../features/settings/editors/ProfileEditor';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';

export default function EditProfile() {
  const { t } = useTranslation();
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const [p, setP] = useState<ProfileDraft>({ goal: s.goal, height: String(s.heightCm), weight: String(s.weightKg) });

  return (
    <Screen
      header={<SubHeader title={t('settings.profile')} onBack={() => router.back()} />}
      footer={
        <FullButton
          label={t('common.save')}
          disabled={!isProfileValid(p)}
          onPress={() => {
            // 목표 칼로리는 따로 정한 값일 수 있어서 건드리지 않는다. (목표 화면의 "기본값으로"로 다시 계산)
            update({ goal: p.goal, heightCm: Number(p.height), weightKg: Number(p.weight) });
            router.back();
          }}
        />
      }
    >
      <ProfileEditor value={p} onChange={setP} />
    </Screen>
  );
}
