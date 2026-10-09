import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Mode } from '../../db/schema';
import { RadioRow } from '../../features/settings/editors/Form';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';

// 1차 범위는 보통맛만. 순한맛·매운맛은 자리만 둔다.
const ENABLED: Mode[] = ['normal'];

export default function EditMode() {
  const { t } = useTranslation();
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const [mode, setMode] = useState<Mode>(s.mode);

  const modes: { value: Mode; name: string; desc: string }[] = [
    { value: 'mild', name: t('settings.modeMild'), desc: t('settings.modeMildDesc') },
    { value: 'normal', name: t('settings.modeNormal'), desc: t('settings.modeNormalDesc') },
    { value: 'spicy', name: t('settings.modeSpicy'), desc: t('settings.modeSpicyDesc') },
  ];

  return (
    <Screen
      header={<SubHeader title={t('settings.mode')} onBack={() => router.back()} />}
      footer={
        <FullButton
          label={t('edit.save')}
          onPress={() => {
            update({ mode });
            router.back();
          }}
        />
      }
    >
      <View style={{ gap: 4 }}>
        {modes.map((m) => {
          const enabled = ENABLED.includes(m.value);
          return (
            <RadioRow
              key={m.value}
              label={m.name}
              desc={m.desc}
              note={enabled ? undefined : t('common.comingSoon')}
              selected={mode === m.value}
              disabled={!enabled}
              onPress={() => setMode(m.value)}
            />
          );
        })}
      </View>
    </Screen>
  );
}
