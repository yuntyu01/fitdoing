import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { formatNumber, roundGram, roundKcal } from '../../../domain/format';
import { ratio, type Nutrition } from '../../../domain/stats';
import type { Targets } from '../../../domain/targets';
import { ProgressBar } from '../../../ui/ProgressBar';
import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius } from '../../../ui/tokens';

const BAR_H = 11; // 시안: 칼로리·탄단지 막대 두께가 같다
const COMPACT_W = 380; // 이보다 좁으면 탄단지 목표("/ 180g")를 숫자 아래 줄에 둔다

/** 오늘 합계: 칼로리 막대 + 탄단지 세 칸. 추정값이라 "약"을 붙이고 반올림한다. 먹은 양은 크게, 목표·단위는 작고 흐리게. */
export function TotalsCard({
  totals,
  targets,
  loggedCount,
}: {
  totals: Nutrition;
  targets: Targets;
  loggedCount: number;
}) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const compact = useWindowDimensions().width < COMPACT_W;
  const macros = [
    { key: 'carbs', label: t('home.carbs'), v: totals.carbs, goal: targets.carbs },
    { key: 'protein', label: t('home.protein'), v: totals.protein, goal: targets.protein },
    { key: 'fat', label: t('home.fat'), v: totals.fat, goal: targets.fat },
  ] as const;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('home.totals')}</Text>
        <Text style={styles.meta}>{t('home.loggedCount', { n: loggedCount })}</Text>
      </View>

      <View style={styles.kcalRow}>
        <Text style={styles.label}>{t('home.kcalLabel')}</Text>
        <Text style={styles.kcalText}>
          <Text style={styles.goal}>{t('common.approx')} </Text>
          <Text style={styles.kcal}>{formatNumber(roundKcal(totals.kcal))}</Text>
          <Text style={styles.goal}>
            {' / '}
            {formatNumber(targets.kcal)} {t('common.kcal')}
          </Text>
        </Text>
      </View>
      <View style={styles.bar}>
        <ProgressBar value={ratio(totals.kcal, targets.kcal)} height={BAR_H} fill={c.bar} track={c.track} />
      </View>

      <View style={styles.divider} />

      <View style={styles.macros}>
        {macros.map((m, i) => (
          <View key={m.key} style={[styles.macro, i > 0 && styles.macroSep, i < macros.length - 1 && styles.macroGap]}>
            <Text style={[styles.label, styles.macroLabel]}>{m.label}</Text>
            {compact ? (
              <View style={styles.value}>
                <Text style={styles.macroNum}>{roundGram(m.v)}</Text>
                <Text style={[styles.goalSmall, styles.goalLine]}>
                  {'/ '}
                  {m.goal}
                  {t('common.gram')}
                </Text>
              </View>
            ) : (
              <Text style={[styles.value, styles.macroLine]}>
                <Text style={styles.macroNum}>{roundGram(m.v)}</Text>
                <Text style={styles.goalSmall}>
                  {' / '}
                  {m.goal}
                  {t('common.gram')}
                </Text>
              </Text>
            )}
            <View style={compact ? styles.macroBarCompact : styles.macroBar}>
              <ProgressBar value={ratio(m.v, m.goal)} height={BAR_H} fill={c.bar} track={c.track} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// 시안(390pt) 실측에 맞춘 크기·간격. 줄 높이를 글자 크기에 가깝게 고정하고, 여백은 화면에 보이는 글자 사이가
// 시안과 같아지도록 정했다 (제목 → 칼로리 숫자 16, 숫자 → 막대 10, 막대 → 구분선 16, 구분선 → 탄단지 19,
// 탄단지 라벨 → 숫자 9, 숫자 → 막대 6, 막대 두께는 모두 11). 두 줄일 때 현재값 → 목표 4.
const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: radius.block,
      paddingHorizontal: layout.cardPad,
      paddingTop: layout.cardPad + 2,
      paddingBottom: layout.cardPad + 4,
    },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, color: c.text },
    meta: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: c.sub },
    kcalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: layout.labelGap },
    label: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 20, color: c.sub },
    kcalText: { flexShrink: 1, textAlign: 'right', lineHeight: 28 },
    kcal: { fontFamily: fonts.semibold, fontSize: 24, color: c.text, fontVariant: ['tabular-nums'] },
    goal: { fontFamily: fonts.regular, fontSize: 14, color: c.sub, fontVariant: ['tabular-nums'] },
    bar: { marginTop: 4 },
    macroBar: { marginTop: 0 },
    macroBarCompact: { marginTop: 6 }, // 목표가 아래 줄일 때는 글자에 아래 여백이 없어 띄운다
    divider: { height: layout.hairline, backgroundColor: c.line, marginVertical: layout.cardPad },
    macros: { flexDirection: 'row' },
    macro: { flex: 1 },
    macroGap: { paddingRight: 10 },
    macroSep: { paddingLeft: 10, borderLeftWidth: layout.hairline, borderLeftColor: c.line },
    macroLabel: { fontSize: 14, lineHeight: 18 },
    value: { marginTop: 4 },
    macroLine: { lineHeight: 22, fontVariant: ['tabular-nums'] },
    macroNum: {
      fontFamily: fonts.semibold,
      fontSize: 22,
      lineHeight: 22,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    goalSmall: { fontFamily: fonts.regular, fontSize: 14, color: c.sub, fontVariant: ['tabular-nums'] },
    goalLine: { marginTop: 4, lineHeight: 18 },
  });
