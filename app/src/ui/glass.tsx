import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { withAlpha } from './color';
import { GlassContext, useGlassTokens, usePalette } from './theme';

/** 안쪽 화면 전체를 유리 색으로 (usePalette·useThemedStyles 가 유리 색을 돌려준다) */
export function GlassScope({ children }: { children: ReactNode }) {
  return <GlassContext.Provider value={true}>{children}</GlassContext.Provider>;
}

/** 화면 바탕: 위쪽 테마색(무채색이면 회색)에서 바탕색으로 어두워지는 그라데이션 */
export function ScreenGradient() {
  const { gradient, stops } = useGlassTokens();
  return <LinearGradient pointerEvents="none" colors={gradient} locations={stops} style={StyleSheet.absoluteFill} />;
}

/** 화면 아래쪽에서 내용이 점점 희미해지는 막. 탭바보다 아래, 내용보다 위 층에 둔다. */
export function BottomFade({ height }: { height: number }) {
  const { bg } = usePalette();
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[withAlpha(bg, 0), withAlpha(bg, 0.72), withAlpha(bg, 0.94)]}
      locations={[0, 0.45, 1]}
      style={[styles.fade, { height }]}
    />
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
