import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radius, space } from './tokens';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  error?: string;
}

/** 회색 입력 상자 + 오른쪽 단위 (키·몸무게·칼로리) */
export function NumberField({ label, value, onChange, unit, error }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.box}>
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          style={styles.input}
          maxLength={5}
          selectionColor={colors.text}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s },
  label: { fontFamily: fonts.medium, fontSize: 19, color: colors.text },
  box: {
    height: 60,
    borderRadius: radius.tile,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.m + space.xs,
  },
  input: {
    flex: 1,
    minWidth: 0, // 웹에서 단위가 밀려나지 않게
    fontFamily: fonts.semibold,
    fontSize: 21,
    color: colors.text,
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  unit: { fontFamily: fonts.regular, fontSize: 18, color: colors.sub },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.sub },
});
