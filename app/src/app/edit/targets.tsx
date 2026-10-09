import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatNumber } from '../../domain/format';
import { defaultTargets, macrosFor, MIN_KCAL } from '../../domain/targets';
import { FormSection, Rows } from '../../features/settings/editors/Form';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { ListRow } from '../../ui/ListRow';
import { NumberField } from '../../ui/NumberField';
import { Screen } from '../../ui/Screen';

export default function EditTargets() {
  const { t } = useTranslation();
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const [kcal, setKcal] = useState(String(s.targets.kcal));
  const [protein, setProtein] = useState(String(s.targets.protein));

  const k = Number(kcal) || 0;
  const p = Number(protein) || 0;
  const tooLow = k < MIN_KCAL;
  const preview = macrosFor(k, p);

  const reset = () => {
    const d = defaultTargets(s.goal, s.weightKg);
    setKcal(String(d.kcal));
    setProtein(String(d.protein));
  };

  return (
    <Screen
      header={<SubHeader title={t('settings.targets')} onBack={() => router.back()} />}
      desc={t('settings.targetsDesc')}
      footer={
        <FullButton
          label={t('edit.save')}
          disabled={tooLow || p <= 0}
          onPress={() => {
            update({ targets: preview });
            router.back();
          }}
        />
      }
    >
      <FormSection title={t('edit.targetsDaily')}>
        <View style={{ gap: 16 }}>
          <NumberField
            label={t('settings.kcal')}
            unit={t('common.kcal')}
            value={kcal}
            onChange={setKcal}
            error={tooLow ? t('settings.minKcal', { min: formatNumber(MIN_KCAL) }) : undefined}
          />
          <NumberField label={t('settings.protein')} unit={t('common.gram')} value={protein} onChange={setProtein} />
        </View>
      </FormSection>
      <FormSection title={t('edit.targetsAuto')}>
        <Rows>
          <ListRow label={t('edit.carbs')} value={`${preview.carbs}${t('common.gram')}`} />
          <ListRow label={t('edit.fat')} value={`${preview.fat}${t('common.gram')}`} />
        </Rows>
      </FormSection>
      <FullButton label={t('settings.resetTargets')} variant="text" onPress={reset} />
    </Screen>
  );
}
