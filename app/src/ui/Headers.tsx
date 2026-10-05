import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from './ProgressBar';
import { colors, fonts, space } from './tokens';

/** 온보딩 상단: 뒤로 · FitDoing · n/3 + 진행 막대 */
export function StepHeader({
  title,
  step,
  total,
  onBack,
}: {
  title: string;
  step: number;
  total: number;
  onBack?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.left}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button">
              <ChevronLeft size={24} color={colors.text} strokeWidth={1.8} />
            </Pressable>
          ) : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.step}>
          {step}/{total}
        </Text>
      </View>
      <ProgressBar value={step / total} height={6} />
    </View>
  );
}

/** 설정 하위 화면 상단: 뒤로 + 제목 */
export function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={[styles.row, styles.sub]}>
      <View style={styles.left}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button">
          <ChevronLeft size={24} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: space.s, gap: space.s },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36 },
  left: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  title: { fontFamily: fonts.medium, fontSize: 17, color: colors.text },
  step: { fontFamily: fonts.regular, fontSize: 15, color: colors.sub, fontVariant: ['tabular-nums'] },
  sub: { marginTop: space.s },
});
