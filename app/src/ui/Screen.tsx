import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space, type } from './tokens';

interface Props {
  header?: ReactNode;
  title?: string;
  desc?: string;
  children: ReactNode;
  footer?: ReactNode; // 하단 고정 (꽉 찬 버튼)
}

/** 바탕 #F2F4F6, 좌우 20 여백, 제목·설명, 스크롤 본문, 하단 고정 버튼 */
export function Screen({ header, title, desc, children, footer }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.pad}>{header}</View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {desc ? <Text style={styles.desc}>{desc}</Text> : null}
        <View style={styles.content}>{children}</View>
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space.gutter + space.indent },
  body: { paddingHorizontal: space.gutter, paddingBottom: space.xl },
  title: { ...type.title, marginTop: 40, marginHorizontal: space.indent },
  desc: { ...type.desc, marginTop: space.s + 2, marginHorizontal: space.indent },
  content: { marginTop: 28, gap: space.m },
  footer: { paddingHorizontal: space.gutter, paddingBottom: space.s, paddingTop: space.s },
});
