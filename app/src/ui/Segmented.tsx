import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space } from './tokens';

interface Props<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  height?: number;
}

/** 온보딩의 목표·끼니 수 같은 떨어진 버튼 묶음. 고른 것만 검정. */
export function Segmented<T extends string | number>({ options, value, onChange, height = 66 }: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.item, { height }, on && styles.itemOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s },
  item: {
    flex: 1,
    borderRadius: radius.tile,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemOn: { backgroundColor: colors.accent },
  label: { fontFamily: fonts.medium, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums'] },
  labelOn: { color: colors.onAccent, fontFamily: fonts.semibold },
});
