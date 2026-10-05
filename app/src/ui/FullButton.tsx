import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, size, type } from './tokens';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

/** 하단 꽉 찬 56px 버튼 */
export function FullButton({ label, onPress, disabled, variant = 'primary' }: Props) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: primary ? colors.accent : colors.line },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[type.button, !primary && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { height: size.button, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.85 },
});
