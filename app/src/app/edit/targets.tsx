import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { formatNumber } from '../../domain/format';
import { defaultTargets, macrosFor, MIN_KCAL } from '../../domain/targets';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { Card, Divider } from '../../ui/Card';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { NumberField } from '../../ui/NumberField';
import { Screen } from '../../ui/Screen';
import { colors, fonts, space, type } from '../../ui/tokens';

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
        <View style={{ gap: space.s }}>
          <FullButton label={t('settings.resetTargets')} variant="secondary" onPress={reset} />
          <FullButton
            label={t('common.save')}
            disabled={tooLow || p <= 0}
            onPress={() => {
              update({ targets: preview });
              router.back();
            }}
          />
        </View>
      }
    >
      <Card style={{ gap: space.m }}>
        <NumberField
          label={t('settings.kcal')}
          unit={t('common.kcal')}
          value={kcal}
          onChange={setKcal}
          error={tooLow ? t('settings.minKcal', { min: formatNumber(MIN_KCAL) }) : undefined}
        />
        <Divider />
        <NumberField label={t('settings.protein')} unit={t('common.gram')} value={protein} onChange={setProtein} />
        <Divider />
        <View style={styles.auto}>
          <Text style={type.desc}>{t('settings.carbsAuto')}</Text>
          <Text style={styles.autoVal}>{preview.carbs}g</Text>
        </View>
        <View style={styles.auto}>
          <Text style={type.desc}>{t('settings.fatAuto')}</Text>
          <Text style={styles.autoVal}>{preview.fat}g</Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  auto: { flexDirection: 'row', justifyContent: 'space-between' },
  autoVal: { fontFamily: fonts.medium, fontSize: 17, color: colors.text, fontVariant: ['tabular-nums'] },
});
