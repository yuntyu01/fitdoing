import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatNumber, roundGram, roundKcal } from '../../../domain/format';
import { eatenFactor } from '../../../domain/stats';
import { remainingPerMeal, type Targets } from '../../../domain/targets';
import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius } from '../../../ui/tokens';
import type { TodayData } from '../useToday';

/**
 * 오늘 식단 표. 기록한 끼니는 먹은 만큼, 아직 안 찍은 끼니는 "N끼 예정"과 남은 양을 똑같이 나눈 목표를 보조색으로, 놓친 끼니는 더 흐리게 "-".
 * 숫자 열은 오른쪽 정렬 + tabular 숫자라 자릿수가 세로로 맞는다.
 */
export function MealTable({ data, targets }: { data: TodayData; targets: Targets }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  // 아직 안 찍은 끼니(놓친 끼니 제외)는 오늘 남은 양을 똑같이 나눠 가진다
  const planned = data.meals.filter((m) => !m.log?.ai && m.state !== 'missed').length;
  const goal = remainingPerMeal(targets, data.totals, planned);
  const heads = [t('home.colKcal'), t('home.colCarbs'), t('home.colProtein'), t('home.colFat')];

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('home.table')}</Text>
        <Pressable style={styles.more} onPress={() => router.navigate('/records')} hitSlop={8}>
          <Text style={styles.moreText}>{t('home.seeAll')}</Text>
          <ChevronRight size={16} color={c.sub} strokeWidth={1.8} />
        </Pressable>
      </View>

      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.th, styles.first]}>{t('home.colMeal')}</Text>
        {heads.map((h) => (
          <Text key={h} style={styles.th}>
            {h}
          </Text>
        ))}
      </View>

      {data.meals.map((m) => {
        const ai = m.log?.ai;
        const p = eatenFactor(m.log?.portion ?? 1, m.log?.sharedMeal); // 먹은 양 × 나눠 먹음(0.5), 오늘 합계와 같은 계산
        const missed = !ai && m.state === 'missed';
        const vals = ai
          ? [roundKcal(ai.kcal * p), roundGram(ai.carbs * p), roundGram(ai.protein * p), roundGram(ai.fat * p)]
          : missed
            ? null
            : [roundKcal(goal.kcal), goal.carbs, goal.protein, goal.fat];
        const label = ai
          ? t('common.meal', { n: m.index })
          : missed
            ? t('home.missedMeal', { n: m.index })
            : t('home.planned', { n: m.index });
        return (
          <View key={m.index} style={styles.row}>
            <Text
              style={[styles.first, styles.meal, !ai && styles.mealMuted, missed && styles.faint]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {(vals ?? [null, null, null, null]).map((v, i) => (
              <Text key={i} style={[styles.td, !ai && styles.muted, missed && styles.faint]}>
                {v === null ? '-' : formatNumber(v)}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    // 시안 실측: 위 13, 아래 9, 행 간격 37.5
    card: {
      backgroundColor: c.card,
      borderRadius: radius.block,
      paddingHorizontal: layout.cardPad,
      paddingTop: 13,
      paddingBottom: 9,
    },
    head: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: layout.titleGap,
    },
    title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, color: c.text },
    more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    moreText: { fontFamily: fonts.regular, fontSize: 14, color: c.sub },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 37.5, // 시안 행 간격
      borderTopWidth: layout.hairline,
      borderTopColor: c.line,
    },
    headerRow: { minHeight: 0, paddingBottom: 6, borderTopWidth: 0 },
    th: {
      flex: 1,
      textAlign: 'right',
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
      color: c.sub,
    },
    first: { flex: 1.5, textAlign: 'left' },
    meal: { fontFamily: fonts.semibold, fontSize: 15, color: c.text },
    mealMuted: { fontFamily: fonts.medium, color: c.sub },
    td: {
      flex: 1,
      textAlign: 'right',
      fontFamily: fonts.regular,
      fontSize: 15,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    muted: { color: c.sub },
    faint: { color: c.faint },
  });
