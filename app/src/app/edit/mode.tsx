import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Mode } from '../../db/schema';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { Card, Divider } from '../../ui/Card';
import { SubHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';
import { colors, fonts, space, type } from '../../ui/tokens';

// 1차 범위는 보통맛만. 순한맛·매운맛은 자리만 둔다.
const ENABLED: Mode[] = ['normal'];

export default function EditMode() {
  const { t } = useTranslation();
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);

  const modes: { value: Mode; name: string; desc: string }[] = [
    { value: 'mild', name: t('settings.modeMild'), desc: t('settings.modeMildDesc') },
    { value: 'normal', name: t('settings.modeNormal'), desc: t('settings.modeNormalDesc') },
    { value: 'spicy', name: t('settings.modeSpicy'), desc: t('settings.modeSpicyDesc') },
  ];

  return (
    <Screen header={<SubHeader title={t('settings.mode')} onBack={() => router.back()} />}>
      <Card style={{ paddingVertical: space.xs }}>
        {modes.map((m, i) => {
          const enabled = ENABLED.includes(m.value);
          const on = s.mode === m.value;
          return (
            <Fragment key={m.value}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                disabled={!enabled}
                onPress={() => update({ mode: m.value })}
                style={[styles.row, !enabled && styles.disabled]}
              >
                <View style={styles.text}>
                  <Text style={styles.name}>
                    {m.name}
                    {!enabled ? <Text style={styles.soon}>{`  ${t('common.comingSoon')}`}</Text> : null}
                  </Text>
                  <Text style={type.caption}>{m.desc}</Text>
                </View>
                {on ? <Check size={22} color={colors.text} strokeWidth={2} /> : null}
              </Pressable>
            </Fragment>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.m, gap: space.m },
  disabled: { opacity: 0.4 },
  text: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.medium, fontSize: 17, color: colors.text },
  soon: { fontFamily: fonts.regular, fontSize: 13, color: colors.sub },
});
