import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from './tokens';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** 카드 안 목록 사이 구분선 */
export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginHorizontal: inset }]} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: space.cardPad },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
});
