import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemedStyles, type Palette } from './theme';
import { layout, radius, text } from './tokens';

/** 합계처럼 중요한 묶음에만 쓰는 카드 (일반 목록은 배경 위에 바로 둔다) */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.card, style]}>{children}</View>;
}

/** 목록 사이 1px 구분선 */
export function Divider({ inset = 0 }: { inset?: number }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.divider, { marginHorizontal: inset }]} />;
}

/** 목록 묶음 위 작은 이름 ("내 계획") */
export function SectionLabel({ children }: { children: string }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.section}>{children}</Text>;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: c.card, borderRadius: radius.card, padding: layout.inner },
    divider: { height: layout.hairline, backgroundColor: c.line },
    section: { ...text.caption, color: c.sub, marginBottom: 4 },
  });
