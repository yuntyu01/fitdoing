import { ChevronLeft, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useThemedStyles, type Palette } from './theme';
import { fonts, layout, text } from './tokens';

/** 온보딩 상단: 뒤로 + 단계 막대(n칸) + "n / N" */
export function StepHeader({ step, total, onBack }: { title?: string; step: number; total: number; onBack?: () => void }) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stepRow}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="back">
            <ChevronLeft size={26} color={c.text} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.steps}>
        <Text style={styles.stepCount}>
          {step} / {total}
        </Text>
        <View style={styles.bars}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[styles.bar, i < step && styles.barOn]} />
          ))}
        </View>
      </View>
      <View style={styles.side} />
    </View>
  );
}

/** 하위 화면 상단: 뒤로 + 제목 (왼쪽 정렬). right에 오른쪽 요소. */
export function SubHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="back">
          <ChevronLeft size={26} color={c.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

/** 가운데 제목 상단 (기록 확인·촬영): 왼쪽 뒤로/닫기, 오른쪽 작은 글자나 버튼 */
export function CenterHeader({
  title,
  onBack,
  close,
  right,
}: {
  title: string;
  onBack: () => void;
  close?: boolean;
  right?: ReactNode;
}) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const Icon = close ? X : ChevronLeft;
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={close ? 'close' : 'back'}>
          <Icon size={26} color={c.text} strokeWidth={1.8} />
        </Pressable>
      </View>
      <Text style={styles.centerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 56, gap: 8 },
    left: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
    title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: c.text, flexShrink: 1 },
    centerTitle: { ...text.heading, fontFamily: fonts.bold, color: c.text, flexShrink: 1, textAlign: 'center' },
    side: { width: 64 },
    sideRight: { alignItems: 'flex-end' },
    stepRow: { flexDirection: 'row', alignItems: 'center', height: 56 },
    steps: { flex: 1, alignItems: 'center', gap: 6 },
    stepCount: { ...text.small, color: c.sub, fontVariant: ['tabular-nums'] },
    bars: { flexDirection: 'row', gap: 6 },
    bar: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.track },
    barOn: { backgroundColor: c.text },
  });

export const headerPad = layout.page;
