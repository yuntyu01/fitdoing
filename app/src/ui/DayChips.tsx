import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles, type Palette } from './theme';
import { fonts, layout, radius } from './tokens';

const DAYS = ['0', '1', '2', '3', '4', '5', '6'] as const;

/** 월~일 칩. 고른 요일은 회색 채움, 나머지는 얇은 테두리. 폭은 화면에 맞춰 나눈다. */
export function DayChips({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 6 },
    chip: { flex: 1, height: 44, borderRadius: radius.field, alignItems: 'center', justifyContent: 'center' },
    on: { backgroundColor: c.selected },
    off: { borderWidth: layout.hairline, borderColor: c.border },
    label: { fontFamily: fonts.regular, fontSize: 14, color: c.sub },
    labelOn: { color: c.text, fontFamily: fonts.semibold },
  });
