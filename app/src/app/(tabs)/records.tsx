import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isEmptyMonth, monthOf, sameMonth, shiftMonth, type YearMonth } from '../../domain/calendar';
import { buildDayDetail } from '../../domain/records';
import { dateKey } from '../../domain/time';
import { Calendar } from '../../features/records/Calendar';
import { DayCard } from '../../features/records/DayCard';
import { useMonthRecords } from '../../features/records/useMonthRecords';
import { useSettingsValue } from '../../features/settings/store';
import { useNow } from '../../features/today/useToday';
import { Card } from '../../ui/Card';
import { colors, fonts, radius, space, tabular, type } from '../../ui/tokens';

export default function RecordsScreen() {
  const { t } = useTranslation();
  const settings = useSettingsValue();
  const now = useNow();
  const today = dateKey(now);
  const [ym, setYm] = useState<YearMonth>(() => monthOf(new Date()));
  const [picked, setPicked] = useState<string | null>(null);

  const rec = useMonthRecords(ym, settings.meals.length);
  const isCurrent = sameMonth(ym, monthOf(now));
  // 고른 날이 이 달에 없으면 (현재 달이면 오늘, 아니면 없음)
  const selected = picked && rec.facts.has(picked) ? picked : isCurrent ? today : null;
  const detail = useMemo(() => {
    const f = selected ? rec.facts.get(selected) : null;
    return f ? buildDayDetail(f, rec.logs) : null;
  }, [selected, rec]);
  const empty = isEmptyMonth(rec.list);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t('records.title')}</Text>

        <View style={styles.summary}>
          <Stat n={rec.summary.full} label={t('records.statFull')} />
          <Stat n={rec.summary.locked} label={t('records.statLocked')} />
          <Stat n={rec.summary.gym} label={t('records.statGym')} />
        </View>

        <Card style={styles.cal}>
          <Calendar
            ym={ym}
            weeks={rec.weeks}
            facts={rec.facts}
            today={today}
            selected={selected}
            onSelect={setPicked}
            onShift={(d) => {
              setYm((cur) => shiftMonth(cur, d));
              setPicked(null);
            }}
          />
          <Legend />
          {empty ? <Text style={styles.empty}>{t('records.monthEmpty')}</Text> : null}
        </Card>

        {detail ? (
          <DayCard detail={detail} targets={settings.targets} />
        ) : (
          <Text style={styles.hint}>{t('records.pickDay')}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <View style={styles.legend}>
      <Key swatch={<View style={[styles.sw, { backgroundColor: colors.accent }]} />} label={t('records.legendFull')} />
      <Key swatch={<View style={[styles.sw, { backgroundColor: '#D5D9DE' }]} />} label={t('records.legendPartial')} />
      <Key swatch={<View style={styles.swDot} />} label={t('records.legendLocked')} />
    </View>
  );
}

function Key({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={styles.key}>
      {swatch}
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: space.gutter, paddingBottom: 120, gap: space.gap },
  title: { ...type.title, marginTop: space.l },
  summary: { flexDirection: 'row', gap: space.s },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.tile, padding: space.m, gap: space.xs },
  statN: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: colors.text, ...tabular },
  statLabel: { ...type.caption },
  cal: { paddingHorizontal: space.m },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: space.m, marginTop: space.m },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sw: { width: 10, height: 10, borderRadius: 5 },
  swDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.text },
  empty: { ...type.desc, textAlign: 'center', marginTop: space.m },
  hint: { ...type.desc, textAlign: 'center', marginTop: space.m },
});
