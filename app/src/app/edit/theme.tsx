import { router } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccentSwatches } from '../../features/settings/AccentSwatches';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { GlassScope, ScreenGradient } from '../../ui/glass';
import { SubHeader } from '../../ui/Headers';
import { ProgressBar } from '../../ui/ProgressBar';
import { Slider } from '../../ui/Slider';
import { usePalette, useThemedStyles, useThemeMode, type Palette } from '../../ui/theme';
import { fonts, glass, layout, size } from '../../ui/tokens';

const STEPS = 20; // 그라데이션은 5%씩 (끄는 동안 값마다 뒤의 화면까지 다시 그리지 않게)
const SIDE = 18;

// 꾸미기: 테마색과 위쪽 그라데이션 세기. 고르면 바로 저장되고, 맨 위 예시와 홈·탭바에 바로 보인다.
export default function EditTheme() {
  return (
    <GlassScope>
      <Content />
    </GlassScope>
  );
}

function Content() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const accent = useSettingsValue().accent;
  const update = useSettings((st) => st.update);
  const gradient = useThemeMode((st) => st.gradient); // 끄는 동안의 값 (손을 떼면 저장)

  const step = (x: number) => Math.round(x * STEPS) / STEPS;

  return (
    <View style={styles.screen}>
      <ScreenGradient />
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.fill} behavior="padding">
          <View style={styles.header}>
            <SubHeader title={t('settings.customize')} onBack={() => router.back()} />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Preview />
            <View>
              <Text style={styles.groupTitle}>{t('settings.accent')}</Text>
              <View style={styles.group}>
                <AccentSwatches value={accent} onChange={(c) => update({ accent: c })} />
                <Text style={styles.gradientLabel}>{t('settings.gradient', { n: Math.round(gradient * 100) })}</Text>
                <Slider
                  label={t('settings.gradient', { n: Math.round(gradient * 100) })}
                  value={gradient}
                  onChange={(x) => useThemeMode.setState({ gradient: step(x) })}
                  onEnd={(x) => update({ gradient: step(x) })}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** 맨 위 예시: 테마색이 쓰이는 자리(지금 끼니·칼로리 막대·촬영 버튼)를 그대로 보여 준다 */
function Preview() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.group}>
      <View style={styles.previewRow}>
        <View style={styles.tile}>
          <Text style={styles.tileTitle}>{t('common.meal', { n: 3 })}</Text>
          <Text style={styles.tileSub}>16:05</Text>
        </View>
        <View style={[styles.tile, styles.tileOn]}>
          <Text style={[styles.tileTitle, styles.textOn]}>{t('common.meal', { n: 4 })}</Text>
          <Text style={[styles.tileSub, styles.textOn]}>19:00</Text>
        </View>
        <View style={styles.fab}>
          <Camera size={24} color={c.onBar} strokeWidth={2} />
        </View>
      </View>
      <ProgressBar value={0.72} height={11} fill={c.bar} track={c.track} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    fill: { flex: 1 },
    header: { paddingHorizontal: layout.page },
    body: { paddingHorizontal: SIDE, paddingTop: 12, paddingBottom: layout.block, gap: 20 },
    groupTitle: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 20,
      color: c.sub,
      marginLeft: 6,
      marginBottom: 6,
    },
    group: { backgroundColor: c.card, borderRadius: glass.cardRadius, padding: 18 },
    gradientLabel: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: c.sub, marginTop: 20 },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: glass.tileGap, marginBottom: 16 },
    tile: {
      width: layout.tile,
      height: layout.tile,
      borderRadius: glass.tileRadius,
      backgroundColor: c.track,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    tileOn: { backgroundColor: c.bar },
    tileTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: c.text },
    tileSub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 16, color: c.sub, fontVariant: ['tabular-nums'] },
    textOn: { color: c.onBar },
    fab: {
      marginLeft: 'auto',
      width: size.fab,
      height: size.fab,
      borderRadius: size.fab / 2,
      backgroundColor: c.bar,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
