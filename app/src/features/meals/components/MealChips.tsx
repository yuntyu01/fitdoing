import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius } from '../../../ui/tokens';

/** 끼니 고르기. 고른 것만 회색 채움, 나머지는 얇은 테두리. 이미 기록한 끼니는 글자를 흐리게. */
export function MealChips({
  meals,
  value,
  onChange,
}: {
  meals: { index: number; logged: boolean }[];
  value: number | null;
  onChange: (i: number) => void;
}) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      {meals.map((m) => {
        const on = m.index === value;
        return (
          <Pressable
            key={m.index}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(m.index)}
            style={[styles.chip, on && styles.on]}
          >
            <Text style={[styles.label, on && styles.labelOn, !on && m.logged && styles.done]} numberOfLines={1}>
              {t('common.meal', { n: m.index })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 8 },
    chip: {
      flex: 1,
      height: 44,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    on: { backgroundColor: c.selected, borderColor: c.selected },
    label: { fontFamily: fonts.regular, fontSize: 15, color: c.sub, fontVariant: ['tabular-nums'] },
    labelOn: { color: c.text, fontFamily: fonts.semibold },
    done: { color: c.faint },
  });
