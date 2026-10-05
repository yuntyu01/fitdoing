import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from './tokens';

const DAYS = ['0', '1', '2', '3', '4', '5', '6'] as const;

/** 월~일 동그라미. 고른 요일만 검정. */
export function DayChips({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { t } = useTranslation();
  const toggle = (d: number) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b));

  return (
    <View style={styles.row}>
      {DAYS.map((k) => {
        const d = Number(k);
        const on = value.includes(d);
        return (
          <Pressable
            key={k}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => toggle(d)}
            style={[styles.chip, on ? styles.on : styles.off]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{t(`weekdayShort.${k}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  chip: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.accent },
  off: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.faint },
  labelOn: { color: colors.onAccent },
});
