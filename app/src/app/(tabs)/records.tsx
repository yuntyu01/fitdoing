import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Settings } from '../../db/schema';
import { isEmptyMonth, monthOf, sameMonth, shiftMonth, type YearMonth } from '../../domain/calendar';
import { buildDayDetail } from '../../domain/records';
import { dateKey } from '../../domain/time';
import { Calendar, CalendarLegend } from '../../features/records/Calendar';
import { DayCard } from '../../features/records/DayCard';
import { loggedMealsOf } from '../../features/records/format';
import { useMonthRecords } from '../../features/records/useMonthRecords';
import { useSettingsValue } from '../../features/settings/store';
import { useNow } from '../../features/today/useToday';
import { useWeeklyRows } from '../../features/weekly/useWeeklyRows';
import { WeeklyCard } from '../../features/weekly/WeeklyCard';
import { useTabBarSpace } from '../../ui/FloatingTabBar';
import { useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, layout, text } from '../../ui/tokens';

type Tab = 'calendar' | 'weekly';

export default function RecordsScreen() {
  const tabSpace = useTabBarSpace(); // 떠 있는 탭바에 마지막 내용이 가리지 않게
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const settings = useSettingsValue();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('calendar');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: tabSpace + layout.block }]}>
        <Text style={styles.title}>{t('records.title')}</Text>

        <View style={styles.tabs} accessibilityRole="tablist">
          {(['calendar', 'weekly'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setTab(k)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
            >
              <Text style={[styles.tabText, tab === k && styles.tabOn]}>
                {k === 'calendar' ? t('records.tabCalendar') : t('records.tabWeekly')}
              </Text>
              <View style={[styles.underline, tab === k && styles.underlineOn]} />
            </Pressable>
          ))}
        </View>

        {/* 달력 탭을 숨겨도 고른 달·날짜는 유지한다 */}
        <View style={tab === 'calendar' ? null : styles.hidden}>
          <CalendarTab settings={settings} now={now} />
        </View>
        {tab === 'weekly' ? <WeeklyTab settings={settings} now={now} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CalendarTab({ settings, now }: { settings: Settings; now: Date }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
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
  const meals = useMemo(() => (selected ? loggedMealsOf(rec.logs, selected) : []), [selected, rec.logs]);
  const empty = isEmptyMonth(rec.list);

  return (
    <View>
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
        note={
          empty
            ? t('records.monthEmpty')
            : t('records.monthStats', { full: rec.summary.full, locked: rec.summary.locked, gym: rec.summary.gym })
        }
      />
      <CalendarLegend />

      <View style={styles.day}>
        {detail ? (
          <DayCard
            detail={detail}
            meals={meals}
            isToday={detail.date === today}
            onOpen={() => router.push({ pathname: '/day', params: { date: detail.date } })}
          />
        ) : (
          <Text style={styles.hint}>{t('records.pickDay')}</Text>
        )}
      </View>
    </View>
  );
}

/** 홈과 같은 주간 그래프 */
function WeeklyTab({ settings, now }: { settings: Settings; now: Date }) {
  const rows = useWeeklyRows(now);
  return <WeeklyCard rows={rows} targets={settings.targets} history={settings.targetHistory} now={now} />;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    body: { paddingHorizontal: layout.page }, // 아래 여백은 떠 있는 탭바 높이로 화면에서 정한다
    title: { ...text.title, color: c.text, marginTop: 20 },
    tabs: {
      flexDirection: 'row',
      marginTop: layout.inner,
      marginBottom: layout.block - 4,
      borderBottomWidth: layout.hairline,
      borderBottomColor: c.line,
    },
    tab: { flex: 1, alignItems: 'center', paddingTop: 10 },
    tabText: { ...text.body, color: c.sub, paddingBottom: 10 },
    tabOn: { fontFamily: fonts.semibold, color: c.text },
    // 고른 탭 아래 얇은 밑줄 (아래 구분선 위에 겹친다)
    underline: { alignSelf: 'stretch', height: 2, marginBottom: -layout.hairline },
    underlineOn: { backgroundColor: c.text },
    hidden: { display: 'none' },
    day: { marginTop: layout.block + 4 },
    hint: { ...text.body, color: c.sub, textAlign: 'center' },
  });
