import { Pressable, StyleSheet, View } from 'react-native';

import { useThemedStyles, type Palette } from './theme';

/** 알약 스위치: 켜면 진한 회색 바탕에 동그라미가 오른쪽 (플랫폼 Switch 대신 직접 그린다) */
export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[styles.track, value ? styles.trackOn : styles.trackOff]}
    >
      <View style={[styles.thumb, value ? styles.on : styles.off]} />
    </Pressable>
  );
}

const W = 50;
const H = 30;
const PAD = 3;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    track: { width: W, height: H, borderRadius: H / 2, justifyContent: 'center' },
    trackOn: { backgroundColor: c.toggleOn },
    trackOff: { backgroundColor: c.track },
    thumb: { width: H - PAD * 2, height: H - PAD * 2, borderRadius: (H - PAD * 2) / 2, backgroundColor: c.thumb },
    on: { marginLeft: W - H + PAD },
    off: { marginLeft: PAD },
  });
