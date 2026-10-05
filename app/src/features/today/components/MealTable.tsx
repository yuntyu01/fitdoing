import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { perMealTarget, type Targets } from '../../../domain/targets';
import { roundGram, roundKcal } from '../../../domain/format';
import { Card } from '../../../ui/Card';
import { colors, fonts, space } from '../../../ui/tokens';
import type { TodayData } from '../useToday';

/** 오늘 식단 표. 아직 안 찍은 끼니는 끼니 목표를 연한 회색으로. */
export function MealTable({ data, targets }: { data: TodayData; targets: Targets }) {
  const { t } = useTranslation();
  const goal = perMealTarget(targets, data.meals.length);

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('home.table')}</Text>
        <Pressable style={styles.more} onPress={() => router.navigate('/records')} hitSlop={8}>
          <Text style={styles.moreText}>{t('home.seeAll')}</Text>
          <ChevronRight size={16} color={colors.sub} strokeWidth={1.8} />
        </Pressable>
      </View>

      <View style={[styles.row, styles.headerRow]}>
        {[t('home.colMeal'), t('home.colKcal'), t('home.colCarbs'), t('home.colProtein'), t('home.colFat')].map(
          (h, i) => (
            <Text key={h} style={[styles.th, i === 0 && styles.first]}>
              {h}
            </Text>
          ),
        )}
      </View>

      {data.meals.map((m) => {
        const ai = m.log?.ai;
        const p = m.log?.portion ?? 1;
        const vals = ai
          ? [roundKcal(ai.kcal * p), roundGram(ai.carbs * p), roundGram(ai.protein * p), roundGram(ai.fat * p)]
          : [goal.kcal, goal.carbs, goal.protein, goal.fat];
        const muted = !ai;
        return (
          <View key={m.index} style={styles.row}>
            <View style={styles.first}>
              <Text style={styles.meal}>{t('common.meal', { n: m.index })}</Text>
              {muted ? <Text style={styles.targetTag}>{t('home.target')}</Text> : null}
            </View>
            {vals.map((v, i) => (
              <Text key={i} style={[styles.td, muted && styles.muted]}>
                {v}
              </Text>
            ))}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: space.m - 4, paddingTop: space.m, paddingBottom: space.s },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.s,
    marginBottom: space.s,
  },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  more: { flexDirection: 'row', alignItems: 'center' },
  moreText: { fontFamily: fonts.regular, fontSize: 13, color: colors.sub },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  headerRow: { minHeight: 30, borderTopWidth: 0 },
  th: { flex: 1, textAlign: 'center', fontFamily: fonts.regular, fontSize: 12, color: colors.sub },
  first: { flex: 0.75, textAlign: 'left', paddingLeft: space.s + 5 },
  meal: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  targetTag: { fontFamily: fonts.regular, fontSize: 11, color: colors.sub },
  td: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  muted: { color: colors.faint },
});
