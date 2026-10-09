import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useThemedStyles, type Palette } from './theme';
import { fonts, text } from './tokens';

interface Props {
  label: string;
  value?: string;
  sub?: string; // 값 아래 작은 글자 (예: 헬스장 주소)
  desc?: string; // 항목명 아래 작은 설명
  onPress?: () => void;
  right?: ReactNode; // 화살표 대신 넣을 것 (스위치, 버튼)
  disabled?: boolean;
  labelBold?: boolean;
}

/** 배경 위 한 줄: 항목명(보통 굵기) · 값(보조색) · 화살표. 박스 없이 쓴다. */
export function ListRow({ label, value, sub, desc, onPress, right, disabled, labelBold }: Props) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={styles.labelCol}>
        <Text style={[styles.label, labelBold && styles.labelBold]}>{label}</Text>
        {desc ? <Text style={styles.desc}>{desc}</Text> : null}
      </View>
      <View style={styles.right}>
        {value || sub ? (
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
        ) : null}
        {right ?? (onPress ? <ChevronRight size={18} color={c.sub} strokeWidth={1.8} /> : null)}
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      gap: 12,
    },
    pressed: { opacity: 0.6 },
    disabled: { opacity: 0.4 },
    labelCol: { flexShrink: 1, gap: 2 },
    label: { ...text.label, color: c.text },
    labelBold: { fontFamily: fonts.semibold },
    desc: { ...text.caption, color: c.sub },
    right: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    valueCol: { alignItems: 'flex-end', flexShrink: 1 },
    value: { ...text.body, color: c.sub, fontVariant: ['tabular-nums'] },
    sub: { ...text.small, color: c.sub, marginTop: 2 },
  });
