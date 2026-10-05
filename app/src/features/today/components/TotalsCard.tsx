import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Targets } from '../../../domain/targets';
import { formatNumber, roundGram, roundKcal } from '../../../domain/format';
import { ratio, type Nutrition } from '../../../domain/stats';
import { Card } from '../../../ui/Card';
import { ProgressBar } from '../../../ui/ProgressBar';
import { colors, fonts, space } from '../../../ui/tokens';

/** 오늘 합계: 칼로리 막대 + 탄단지 세 칸. 추정값이라 "약"을 붙이고 반올림한다. */
export function TotalsCard({ totals, targets, loggedCount }: { totals: Nutrition; targets: Targets; loggedCount: number }) {
  const { t } = useTranslation();
  const macros = [
    { key: 'carbs', label: t('home.carbs'), v: totals.carbs, goal: targets.carbs },
    { key: 'protein', label: t('home.protein'), v: totals.protein, goal: targets.protein },
    { key: 'fat', label: t('home.fat'), v: totals.fat, goal: targets.fat },
  ] as const;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('home.totals')}</Text>
        <Text style={styles.meta}>{t('home.loggedCount', { n: loggedCount })}</Text>
      </View>

      <View style={styles.kcalRow}>
        <Text style={styles.label}>{t('home.kcalLabel')}</Text>
        <Text style={styles.kcalText}>
          <Text style={styles.approx}>{t('common.approx')} </Text>
          <Text style={styles.kcal}>{formatNumber(roundKcal(totals.kcal))}</Text>
          <Text style={styles.goal}>
            {'  /  '}
            {formatNumber(targets.kcal)} {t('common.kcal')}
          </Text>
        </Text>
      </View>
      <ProgressBar value={ratio(totals.kcal, targets.kcal)} height={6} />

      <View style={styles.macros}>
        {macros.map((m, i) => (
          <View key={m.key} style={[styles.macro, i > 0 && styles.macroSep]}>
            <Text style={styles.label}>{m.label}</Text>
            <Text style={styles.macroText}>
              <Text style={styles.macroNum}>{roundGram(m.v)}</Text>
              <Text style={styles.goal}>
                {' / '}
                {m.goal}
                {t('common.gram')}
              </Text>
            </Text>
            <ProgressBar value={ratio(m.v, m.goal)} height={6} />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.gap, paddingHorizontal: space.m + 2 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.sub },
  kcalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontFamily: fonts.regular, fontSize: 14, color: colors.sub },
  kcalText: {},
  approx: { fontFamily: fonts.regular, fontSize: 14, color: colors.sub },
  kcal: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  goal: { fontFamily: fonts.regular, fontSize: 14, color: colors.sub },
  macros: { flexDirection: 'row', marginTop: space.s },
  macro: { flex: 1, gap: 6, paddingRight: space.s },
  macroSep: {
    paddingLeft: space.s + 2,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.line,
  },
  macroText: {},
  macroNum: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
});
