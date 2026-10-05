import { StyleSheet, View } from 'react-native';

import { colors } from './tokens';

/** 0~1 채움 막대 */
export function ProgressBar({ value, height = 8 }: { value: number; height?: number }) {
  const pct = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as const;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={[styles.fill, { width: pct, borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
});
