import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ageOf,
  cleanNickname,
  isProfileValid,
  ProfileEditor,
  type ProfileDraft,
} from '../../features/settings/editors/ProfileEditor';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';

export default function EditProfile() {
  const { t } = useTranslation();
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const [p, setP] = useState<ProfileDraft>({
    goal: s.goal,
    sex: s.sex,
    age: s.age === null ? '' : String(s.age),
    height: String(s.heightCm),
    weight: String(s.weightKg),
  });
  const [nickname, setNickname] = useState(s.nickname);

  return (
    <Screen
      header={<SubHeader title={t('settings.myProfile')} onBack={() => router.back()} />}
      desc={t('edit.profileTargetsNote')}
      footer={
        <FullButton
          label={t('edit.save')}
          disabled={!isProfileValid(p)}
          onPress={() => {
            // 목표는 명시적으로 다시 계산(영양 목표 화면에서 적용)하기 전까지 그대로 둔다.
            update({
              goal: p.goal,
              sex: p.sex,
              age: ageOf(p),
              heightCm: Number(p.height),
              weightKg: Number(p.weight),
              nickname: cleanNickname(nickname),
            });
            router.back();
          }}
        />
      }
    >
      <ProfileEditor
        value={p}
        onChange={setP}
        goalTitle={t('edit.goal')}
        nickname={{ value: nickname, onChange: setNickname, title: t('edit.nickname') }}
      />
    </Screen>
  );
}
