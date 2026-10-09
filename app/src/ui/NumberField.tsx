import { StyleSheet, Text, TextInput, View } from 'react-native';

import { usePalette, useThemedStyles, type Palette } from './theme';
import { fonts, layout, radius, text } from './tokens';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  error?: string;
}

/** 라벨 + 얇은 테두리 입력칸 + 오른쪽 단위 (키·몸무게·칼로리) */
export function NumberField({ label, value, onChange, unit, error }: Props) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
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
          selectionColor={c.text}
          accessibilityLabel={label}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { gap: layout.related },
    label: { ...text.caption, color: c.sub },
    box: {
      height: 52,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      backgroundColor: c.card,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    input: {
      flex: 1,
      minWidth: 0, // 웹에서 단위가 밀려나지 않게
      fontFamily: fonts.medium,
      fontSize: 17,
      color: c.text,
      padding: 0,
      fontVariant: ['tabular-nums'],
    },
    unit: { ...text.body, color: c.sub },
    error: { ...text.caption, color: c.text },
  });
