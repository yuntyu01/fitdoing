import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles, type Palette } from './theme';
import { fonts, layout, radius } from './tokens';

interface Props<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  height?: number;
}

/** 떨어진 선택 버튼 묶음 (끼니 수·목표 등). 고른 것만 회색 채움 + 밝은 글자, 나머지는 얇은 테두리. */
export function Segmented<T extends string | number>({ options, value, onChange, height = 48 }: Props<T>) {
  const styles = useThemedStyles(makeStyles);
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
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {o.label}
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
    item: {
      flex: 1,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    itemOn: { backgroundColor: c.selected, borderColor: c.selected },
    label: { fontFamily: fonts.regular, fontSize: 15, color: c.sub, fontVariant: ['tabular-nums'] },
    labelOn: { color: c.text, fontFamily: fonts.semibold },
  });
