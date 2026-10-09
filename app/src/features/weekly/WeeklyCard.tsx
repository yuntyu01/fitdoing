import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatNumber, roundGram, roundKcal } from '../../domain/format';
import { targetsOn, type TargetEntry, type Targets } from '../../domain/targets';
import { addDays, parseDateKey } from '../../domain/time';
import { WEEKLY_METRICS, weeklySeries, weeklySummary, type WeeklyMetric, type WeeklyRow } from '../../domain/weekly';
import { useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, layout, radius } from '../../ui/tokens';

const CHART_H = 104; // 막대가 쓰는 높이
const VALUE_H = 18; // 막대 위 값 글자 자리
const BAR_W = 14; // 시안 실측 (360 폭 칸 36에도 한 쌍 32가 들어간다)
const TARGET_COL = 44; // 오른쪽 목표값 글자 자리
const DASHES = 48;

type Wd = '0' | '1' | '2' | '3' | '4' | '5' | '6';
const TARGET_KEY: Record<WeeklyMetric, keyof Targets> = {
  kcal: 'kcal',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
};
const LABEL_KEY = { kcal: 'home.kcalLabel', protein: 'home.protein', carbs: 'home.carbs', fat: 'home.fat' } as const;

/**
 * 홈 맨 아래 주간 그래프: 요일마다 지난주·이번 주 막대를 나란히, 이번 주 값은 막대 위에 적고 목표는 점선.
 * 아래에 영양소 탭과 한 줄 피드백(목표에서 가장 벗어난 날, 이번 주·지난주 평균).
 */
export function WeeklyCard({
  rows,
  targets,
  history,
  now,
}: {
  rows: WeeklyRow[];
  targets: Targets;
  /** 날짜별 목표. 지난 날은 그날 목표로 본다. */
  history: TargetEntry[];
  now: Date;
}) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [metric, setMetric] = useState<WeeklyMetric>('kcal');
  const kcal = metric === 'kcal';
  const unit = kcal ? t('common.kcal') : t('common.gram');
  const withUnit = (v: string) => (kcal ? `${v} ${unit}` : `${v}${unit}`);
  const round = kcal ? roundKcal : roundGram;
  const s = useMemo(
    () => weeklySeries(rows, metric, (date) => targetsOn(history, targets, date)[TARGET_KEY[metric]], now),
    [rows, metric, history, targets, now],
  );
  const sum = useMemo(() => weeklySummary(s), [s]);
  const fmt = (v: number | null) => (v === null ? '-' : formatNumber(round(v)));
  const h = (v: number) => Math.max(2, (v / s.max) * CHART_H);
  const targetTop = VALUE_H + (1 - s.target / s.max) * CHART_H;

  const monday = parseDateKey(s.days[0].date);
  const sunday = addDays(monday, 6);
  const md = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;

  let feedback: string;
  if (sum.completed === 0) feedback = t('weekly.waiting');
  else if (!sum.furthest) feedback = t('weekly.allIn');
  else
    feedback = t(sum.furthest.diff < 0 ? 'weekly.under' : 'weekly.over', {
      day: t(`weekdayLong.${String(sum.furthest.index) as Wd}`),
      metric: t(LABEL_KEY[metric]),
      n: formatNumber(round(Math.abs(sum.furthest.diff))),
      unit: kcal ? ` ${unit}` : unit,
    });

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('weekly.title')}</Text>
        <Text style={styles.range}>{t('weekly.range', { from: md(monday), to: md(sunday) })}</Text>
      </View>

      <Text style={styles.achieved}>
        {sum.completed > 0 ? t('weekly.achieved', { n: sum.completed, m: sum.achieved }) : t('weekly.noneDone')}
      </Text>
      <View style={styles.legend}>
        <Legend swatch={<View style={[styles.dot, styles.lastFill]} />} label={t('weekly.lastWeek')} styles={styles} />
        <Legend swatch={<View style={[styles.dot, styles.thisFill]} />} label={t('weekly.thisWeek')} styles={styles} />
        <Legend swatch={<View style={styles.dash} />} label={t('weekly.target')} styles={styles} />
      </View>

      <View style={styles.chart}>
        <View style={styles.plot}>
          <View style={[styles.targetLine, { top: targetTop }]} pointerEvents="none">
            {Array.from({ length: DASHES }, (_, i) => (
              <View key={i} style={styles.dashSeg} />
            ))}
          </View>
          <View style={styles.cols}>
            {s.days.map((d) => {
              const showCur = d.state === 'done' || d.state === 'today';
              const cur = d.current ?? 0;
              const inBand = cur >= s.band.lo && cur <= s.band.hi;
              return (
                <View key={d.date} style={styles.col}>
                  {showCur ? (
                    <Text style={[styles.value, inBand && d.state === 'done' && styles.valueOn]} numberOfLines={1}>
                      {fmt(cur)}
                    </Text>
                  ) : null}
                  <View style={styles.pair}>
                    <View style={[styles.bar, styles.lastFill, { height: d.last ? h(d.last) : 0 }]} />
                    {d.state === 'missing' ? (
                      <View style={[styles.bar, styles.missing, { height: h(s.target) }]} />
                    ) : (
                      <View style={[styles.bar, styles.thisFill, { height: showCur ? h(cur) : 0 }]} />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
        <View style={[styles.targetCol, { top: targetTop - 9 }]}>
          <Text style={styles.targetText} numberOfLines={1}>
            {fmt(s.target)}
            {kcal ? '' : unit}
          </Text>
        </View>
      </View>
      <View style={styles.baseline} />
      <View style={styles.labels}>
        {s.days.map((d) => (
          <View key={d.date} style={styles.labelCol}>
            <Text style={[styles.dayLabel, d.state === 'today' && styles.dayToday]}>
              {t(`weekdayShort.${String(d.index) as Wd}`)}
            </Text>
            {d.state === 'today' ? <Text style={styles.inProgress}>{t('weekly.inProgress')}</Text> : null}
          </View>
        ))}
        <View style={{ width: TARGET_COL }} />
      </View>

      <View style={styles.tabs}>
        {WEEKLY_METRICS.map((m, i) => (
          <Pressable
            key={m}
            accessibilityRole="tab"
            accessibilityState={{ selected: metric === m }}
            onPress={() => setMetric(m)}
            style={styles.tab}
          >
            {i > 0 ? <View style={styles.tabSep} /> : null}
            <Text style={[styles.tabText, metric === m && styles.tabOn]}>{t(LABEL_KEY[m])}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.divider} />
      <View style={styles.feedback}>
        <Text style={styles.feedbackText}>{feedback}</Text>
        <Text style={styles.avgText}>
          {t('weekly.avgLine', { avg: withUnit(fmt(s.avg)), last: withUnit(fmt(s.lastAvg)) })}
        </Text>
      </View>
    </View>
  );
}

function Legend({
  swatch,
  label,
  styles,
}: {
  swatch: ReactNode;
  label: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: radius.block,
      paddingHorizontal: layout.cardPad,
      paddingTop: layout.cardPad - 3, // 시안 실측: 제목이 다른 카드보다 조금 위
      paddingBottom: layout.feedbackPad,
    },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: layout.labelGap },
    title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, color: c.text },
    range: { fontFamily: fonts.regular, fontSize: 14, color: c.sub, fontVariant: ['tabular-nums'] },
    // 시안 실측: 제목 → 요약 글자 약 14, 요약 → 범례 8 (범례는 폭과 관계없이 항상 다음 줄)
    achieved: { marginTop: 8, fontFamily: fonts.regular, fontSize: 15, lineHeight: 20, color: c.text },
    legend: { marginTop: layout.labelGap, flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: c.sub },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dash: { width: 12, height: 0, borderTopWidth: 1, borderColor: c.sub },
    lastFill: { backgroundColor: c.barLast },
    thisFill: { backgroundColor: c.bar },
    chart: { marginTop: 8, paddingRight: TARGET_COL },
    plot: { height: VALUE_H + CHART_H },
    targetLine: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', gap: 4, overflow: 'hidden' },
    dashSeg: { width: 4, height: 1, backgroundColor: c.sub, opacity: 0.7 },
    cols: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },
    col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
    value: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 14, color: c.sub, fontVariant: ['tabular-nums'] },
    valueOn: { fontFamily: fonts.semibold, color: c.text },
    pair: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
    bar: { width: BAR_W, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
    missing: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, backgroundColor: 'transparent' },
    targetCol: { position: 'absolute', right: 0, width: TARGET_COL - 6, height: 18, justifyContent: 'center' },
    targetText: {
      fontFamily: fonts.regular,
      fontSize: 11,
      color: c.sub,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    baseline: { height: layout.hairline, backgroundColor: c.line, marginRight: TARGET_COL },
    labels: { flexDirection: 'row', marginTop: 6, paddingBottom: 15 }, // 아래 15 = "진행 중" 한 줄 자리
    labelCol: { flex: 1, alignItems: 'center', gap: 2 },
    dayLabel: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: c.sub },
    dayToday: { fontFamily: fonts.semibold, color: c.text },
    // 막대 칸(좁으면 32)보다 넓어도 양옆으로 넘쳐 한 줄로 보이게 칸 밖으로 띄운다
    inProgress: {
      position: 'absolute',
      top: 19,
      left: '50%',
      width: 64,
      marginLeft: -32,
      textAlign: 'center',
      fontFamily: fonts.medium,
      fontSize: 11,
      lineHeight: 14,
      color: c.text,
    },
    tabs: { flexDirection: 'row', marginTop: 8 }, // 요일·"진행 중" 아래 → 탭 8 (시안)
    tab: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
    tabSep: { position: 'absolute', left: 0, top: 14, height: 16, width: layout.hairline, backgroundColor: c.line },
    tabText: { fontFamily: fonts.regular, fontSize: 14, color: c.sub },
    tabOn: { fontFamily: fonts.semibold, color: c.text },
    divider: { height: layout.hairline, backgroundColor: c.line },
    feedback: { marginTop: layout.titleGap, gap: layout.labelGap },
    feedbackText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: c.text },
    avgText: { fontFamily: fonts.regular, fontSize: 13, color: c.sub, fontVariant: ['tabular-nums'] },
  });
