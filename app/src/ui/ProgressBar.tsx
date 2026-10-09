import { StyleSheet, View } from 'react-native';

import { usePalette } from './theme';

/** 0~1 채움 막대. 색은 테마의 막대색(fill·track으로 바꿀 수 있다). */
export function ProgressBar({
  value,
  height = 8,
  fill,
  track,
}: {
  value: number;
  height?: number;
  fill?: string;
  track?: string;
}) {
  const c = usePalette();
  const pct = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as const;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: track ?? c.track }]}>
      <View style={[styles.fill, { width: pct, borderRadius: height / 2, backgroundColor: fill ?? c.bar }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
  fill: { height: '100%' },
});
