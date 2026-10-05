import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space } from '../../../ui/tokens';

/** 끼니 고르기. 고른 것만 검정, 이미 기록한 끼니는 글자를 흐리게. */
export function MealChips({ meals, value, onChange }: { meals: { index: number; logged: boolean }[]; value: number | null; onChange: (i: number) => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      {meals.map((m) => {
        const on = m.index === value;
        return (
          <Pressable key={m.index} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(m.index)} style={[styles.chip, on && styles.on]}>
            <Text style={[styles.label, on && styles.labelOn, !on && m.logged && styles.done]}>{t('common.meal', { n: m.index })}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s },
  chip: { flex: 1, height: 48, borderRadius: radius.tile, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.accent },
  label: { fontFamily: fonts.medium, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  labelOn: { color: colors.onAccent, fontFamily: fonts.semibold },
  done: { color: colors.faint },
});
