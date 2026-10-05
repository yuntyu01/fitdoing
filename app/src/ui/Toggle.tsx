import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from './tokens';

/** 시안의 알약 스위치: 켜면 검정 바탕에 흰 동그라미가 오른쪽 (플랫폼 Switch 대신 직접 그린다) */
export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[styles.track, { backgroundColor: value ? colors.accent : colors.line }]}
    >
      <View style={[styles.thumb, value ? styles.on : styles.off]} />
    </Pressable>
  );
}

const W = 54;
const H = 32;
const PAD = 3;

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2, justifyContent: 'center' },
  thumb: { width: H - PAD * 2, height: H - PAD * 2, borderRadius: (H - PAD * 2) / 2, backgroundColor: colors.card },
  on: { marginLeft: W - H + PAD },
  off: { marginLeft: PAD },
});
