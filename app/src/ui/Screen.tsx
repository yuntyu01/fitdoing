import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemedStyles, type Palette } from './theme';
import { layout, text } from './tokens';

interface Props {
  header?: ReactNode;
  title?: string;
  desc?: string;
  children: ReactNode;
  footer?: ReactNode; // 하단 고정 (꽉 찬 버튼). 키보드가 열리면 키보드 위로 올라온다.
  gap?: number; // 본문 묶음 사이 (기본: 큰 영역 사이 28)
  bottomSpace?: number; // 스크롤 끝 여백 (떠 있는 탭바가 있는 화면)
}

/** 배경 위 좌우 24, 제목(24)·설명, 스크롤 본문, 하단 고정 버튼. 다크·라이트 테마를 따른다. */
export function Screen({ header, title, desc, children, footer, gap = layout.block, bottomSpace }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <SafeAreaView style={styles.safe} edges={footer ? ['top', 'bottom'] : ['top']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header ? <View style={styles.header}>{header}</View> : null}
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: bottomSpace ?? layout.block }]}
          keyboardShouldPersistTaps="handled"
        >
          {title || desc ? (
            <View style={styles.titleBlock}>
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {desc ? <Text style={styles.desc}>{desc}</Text> : null}
            </View>
          ) : null}
          <View style={{ gap }}>{children}</View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    fill: { flex: 1 },
    header: { paddingHorizontal: layout.page },
    body: { paddingHorizontal: layout.page },
    titleBlock: { marginTop: 20, marginBottom: layout.block, gap: layout.related },
    title: { ...text.title, color: c.text },
    desc: { ...text.body, color: c.sub },
    footer: { paddingHorizontal: layout.page, paddingTop: 12, paddingBottom: 12, gap: 8 },
  });
