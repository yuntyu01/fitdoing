import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, space } from './tokens';

interface Props {
  label: string;
  value?: string;
  sub?: string; // 값 아래 작은 글자 (예: 헬스장 주소)
  onPress?: () => void;
  right?: ReactNode; // 화살표 대신 넣을 것 (스위치, 시계 아이콘)
  disabled?: boolean;
  labelBold?: boolean;
}

/** 카드 안 한 줄 + 화살표 */
export function ListRow({ label, value, sub, onPress, right, disabled, labelBold }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.label, labelBold && styles.labelBold]}>{label}</Text>
      <View style={styles.right}>
        <View style={styles.valueCol}>
          {value ? (
            <Text style={styles.value} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {sub ? (
            <Text style={styles.sub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        {right ?? (onPress ? <ChevronRight size={20} color={colors.sub} strokeWidth={1.8} /> : null)}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.m,
    gap: space.m,
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  label: { fontFamily: fonts.medium, fontSize: 18, color: colors.text },
  labelBold: { fontFamily: fonts.bold },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexShrink: 1 },
  valueCol: { alignItems: 'flex-end', flexShrink: 1 },
  value: { fontFamily: fonts.regular, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums'] },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: colors.sub, marginTop: 2 },
});
