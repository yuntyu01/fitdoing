import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles, type Palette } from './theme';
import { fonts, radius, size } from './tokens';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** primary: 밝은(다크)·진한(라이트) 꽉 찬 버튼, secondary: 카드색 버튼, text: 글자만 */
  variant?: 'primary' | 'secondary' | 'text';
  icon?: ReactNode;
}

/** 하단 꽉 찬 56px 버튼 */
export function FullButton({ label, onPress, disabled, variant = 'primary', icon }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        styles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.inner}>
        {icon}
        <Text style={[styles.label, variant === 'primary' ? styles.labelPrimary : styles.labelOther]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    btn: { height: size.button, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
    primary: { backgroundColor: c.primary },
    secondary: { backgroundColor: c.card },
    text: { backgroundColor: 'transparent', height: 44 },
    inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22 },
    labelPrimary: { color: c.onPrimary },
    labelOther: { color: c.text },
    disabled: { opacity: 0.35 },
    pressed: { opacity: 0.85 },
  });
