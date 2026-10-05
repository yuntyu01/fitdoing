import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatNumber, roundGram, roundKcal } from '../../domain/format';
import type { Targets } from '../../domain/targets';
import { WEEKLY_METRICS, weeklySeries, type WeeklyMetric, type WeeklyRow } from '../../domain/weekly';
import { Card } from '../../ui/Card';
import { colors, fonts, tabular } from '../../ui/tokens';

const CHART_H = 84;
const BAR_W = 9;
const LAST_COLOR = '#D5D9DF';
const THIS_COLOR = '#3C3F46';
const TODAY_COLOR = '#8B95A1';

const TARGET_KEY: Record<WeeklyMetric, keyof Targets> = { kcal: 'kcal', protein: 'protein', carbs: 'carbs', fat: 'fat' };
const LABEL_KEY = { kcal: 'home.kcalLabel', protein: 'home.protein', carbs: 'home.carbs', fat: 'home.fat' } as const;

/** 홈 아래 주간 그래프: 지난주(옅은 막대)와 이번 주(진한 막대)를 요일별로 나란히 보여준다. */
export function WeeklyCard({ rows, targets, now }: { rows: WeeklyRow[]; targets: Targets; now: Date }) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<WeeklyMetric>('kcal');
  const unit = metric === 'kcal' ? t('common.kcal') : t('common.gram');
  const round = metric === 'kcal' ? roundKcal : roundGram;
  const target = targets[TARGET_KEY[metric]];
  const s = useMemo(() => weeklySeries(rows, metric, target, now), [rows, metric, target, now]);
  const h = (v: number) => Math.max(3, (v / s.max) * CHART_H);
  const bandTop = (1 - s.band.hi / s.max) * CHART_H;
  const bandH = ((s.band.hi - s.band.lo) / s.max) * CHART_H;
  const fmt = (v: number | null) => (v === null ? '-' : formatNumber(round(v)));

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Text style={styles.title}>{t('weekly.title')}</Text>
          <View style={styles.legend}>
            <Legend color={LAST_COLOR} label={t('weekly.lastWeek')} />
            <Legend color={THIS_COLOR} label={t('weekly.thisWeek')} />
          </View>
          <Text style={styles.band2}>{t('weekly.band')}</Text>
        </View>
        <View style={styles.headRight}>
          <View style={styles.avgRow}>
            <Text style={styles.avgLabel}>{t('weekly.avg')}</Text>
            <Text style={styles.avgText}>
              <Text style={styles.avgNum}>{fmt(s.avg)}</Text>
              <Text style={styles.avgUnit}> {unit}</Text>
            </Text>
          </View>
          <Text style={styles.last}>
            {t('weekly.lastWeek')} {fmt(s.lastAvg)} {unit}
          </Text>
        </View>
      </View>

      <View style={styles.chartWrap}>
        <View style={{ height: CHART_H }}>
          <View style={[styles.band, { top: bandTop, height: bandH }]} />
          <View style={styles.bars}>
            {s.days.map((d) => (
              <View key={d.date} style={styles.col}>
                <View style={styles.pair}>
                  <View style={[styles.bar, { height: d.last ? h(d.last) : 0, backgroundColor: LAST_COLOR }]} />
                  {d.state === 'missing' ? (
                    <View style={[styles.bar, styles.missing, { height: h(s.target) }]} />
                  ) : d.state === 'future' ? (
                    <View style={styles.bar} />
                  ) : (
                    <View style={styles.barWithDot}>
                      {d.state === 'today' ? <View style={styles.todayDot} /> : null}
                      <View
                        style={[
                          styles.bar,
                          { height: h(d.current ?? 0), backgroundColor: d.state === 'today' ? TODAY_COLOR : THIS_COLOR },
                        ]}
                      />
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.baseline} />
        <View style={styles.labels}>
          {s.days.map((d) => (
            <View key={d.date} style={styles.labelCol}>
              <Text style={[styles.dayLabel, d.state === 'today' && styles.dayToday]}>{t(`weekdayShort.${String(d.index) as '0'}`)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.tabs}>
        {WEEKLY_METRICS.map((m, i) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityState={{ selected: metric === m }}
            onPress={() => setMetric(m)}
            style={styles.tab}
          >
            {i > 0 ? <View style={styles.tabSep} /> : null}
            <Text style={[styles.tabText, metric === m && styles.tabOn]}>{t(LABEL_KEY[m])}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 12, paddingTop: 18, paddingBottom: 0 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 8 },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  headLeft: { gap: 4 },
  headRight: { alignItems: 'flex-end' },
  avgRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  band2: { fontFamily: fonts.regular, fontSize: 11, color: colors.faint },
  avgLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.sub },
  avgText: { color: colors.text },
  avgNum: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.text, ...tabular },
  avgUnit: { fontFamily: fonts.regular, fontSize: 13, color: colors.sub },
  last: { fontFamily: fonts.regular, fontSize: 12, color: colors.sub, marginTop: 2, ...tabular },
  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: fonts.regular, fontSize: 12, color: colors.sub },
  chartWrap: { marginTop: 14, paddingHorizontal: 4 },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.faint,
    opacity: 0.6,
  },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  pair: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: BAR_W, borderTopLeftRadius: 2.5, borderTopRightRadius: 2.5 },
  missing: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.faint, backgroundColor: 'transparent' },
  baseline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  labels: { flexDirection: 'row', marginTop: 6 },
  labelCol: { flex: 1, alignItems: 'center', gap: 2 },
  dayLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.sub },
  dayToday: { fontFamily: fonts.bold, color: colors.text },
  barWithDot: { alignItems: 'center', justifyContent: 'flex-end' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent, marginBottom: 3 },
  tabs: { flexDirection: 'row', marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 13 },
  tabSep: { position: 'absolute', left: 0, top: 14, height: 16, width: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  tabText: { fontFamily: fonts.regular, fontSize: 13, color: colors.faint },
  tabOn: { fontFamily: fonts.bold, color: colors.text },
});
