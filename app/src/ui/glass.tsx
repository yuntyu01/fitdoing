import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode, type RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { create } from 'zustand';

import { GlassContext, useGlassTokens, usePalette } from './theme';

/** 안쪽 화면 전체를 유리 색으로 (usePalette·useThemedStyles 가 유리 색을 돌려준다) */
export function GlassScope({ children }: { children: ReactNode }) {
  return <GlassContext.Provider value={true}>{children}</GlassContext.Provider>;
}

/**
 * Android 의 흐림은 흐릴 대상(BlurTargetView)을 알아야 하는데, 탭바는 네비게이터가 화면 밖에 그려서 Context 로 받을 수 없다.
 * 그래서 지금 보이는 화면이 자기 대상을 여기에 알린다. 알린 화면이 없으면 탭바는 불투명하게 그린다(GlassBackground).
 */
const useBlurTarget = create<{ target: RefObject<View | null> | null }>(() => ({ target: null }));

export function useRegisterBlurTarget(target: RefObject<View | null>) {
  useFocusEffect(
    useCallback(() => {
      useBlurTarget.setState({ target });
      return () => useBlurTarget.setState({ target: null });
    }, [target]),
  );
}

/** 둥근 블록 안쪽을 채우는 유리 바탕: 뒤의 내용을 흐리게 비추고 그 위에 색을 얹는다. 부모는 overflow: 'hidden'과 같은 모서리를 가져야 한다. */
export function GlassBackground({ color, alpha }: { color: string; alpha: number }) {
  const { scheme } = usePalette();
  const target = useBlurTarget((s) => s.target);
  if (Platform.OS === 'android' && !target) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />;
  }
  return (
    <>
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={Platform.OS === 'android' ? 100 : 60}
        tint={scheme}
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={target ?? undefined}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(color, alpha) }]} />
    </>
  );
}

/** 화면 바탕: 위쪽 회색에서 바탕색으로 어두워지는 그라데이션 */
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

function withAlpha(hex: string, alpha: number) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
