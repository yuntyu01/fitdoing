import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettingsValue } from '../../features/settings/store';
import { CameraFab, FAB_CLEARANCE } from '../../features/today/components/CameraFab';
import { DateCard } from '../../features/today/components/DateCard';
import { MealTable } from '../../features/today/components/MealTable';
import { TileRow } from '../../features/today/components/TileRow';
import { TotalsCard } from '../../features/today/components/TotalsCard';
import { hhmm } from '../../features/today/format';
import { useNow, useToday } from '../../features/today/useToday';
import { useWeeklyRows } from '../../features/weekly/useWeeklyRows';
import { WeeklyCard } from '../../features/weekly/WeeklyCard';
import { useTabBarSpace } from '../../ui/FloatingTabBar';
import { useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, layout } from '../../ui/tokens';

const URGENT_MS = 10 * 60_000;

export default function TodayScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace(); // 탭바가 내용 위에 떠 있어서 그만큼 띄운다
  const styles = useThemedStyles(makeStyles);
  const settings = useSettingsValue();
  const now = useNow();
  const data = useToday(settings, now);
  const weeklyRows = useWeeklyRows(now);

  const cur = data.current;
  const guide = cur
    ? t('home.guide', { meal: cur.index, time: hhmm(cur.at), hours: settings.lockMinutes / 60 })
    : data.loggedCount === data.meals.length
      ? t('home.guideDone')
      : t('home.guideNone');
  const urgent = !!cur && cur.at.getTime() - now.getTime() <= URGENT_MS;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: tabSpace + FAB_CLEARANCE }}>
        <DateCard topInset={insets.top} now={now} streak={data.streak} loggedDays={data.loggedDays} />
        <View style={styles.tiles}>
          <TileRow data={data} settings={settings} now={now} />
          <Text style={styles.guide}>{guide}</Text>
        </View>
        <View style={styles.cards}>
          <TotalsCard totals={data.totals} targets={settings.targets} loggedCount={data.loggedCount} />
          <MealTable data={data} targets={settings.targets} />
          <WeeklyCard rows={weeklyRows} targets={settings.targets} history={settings.targetHistory} now={now} />
        </View>
      </ScrollView>
      <CameraFab urgent={urgent} bottom={tabSpace} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1 },
    // 시안 실측: 요일 줄 → 끼니 줄 15, 끼니 줄 → 안내 글자 9, 끼니 줄 → 첫 카드 41
    tiles: { marginTop: 15, gap: 6 },
    guide: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: c.sub, paddingHorizontal: layout.strip },
    cards: { paddingHorizontal: layout.screen, marginTop: 15, gap: layout.section },
  });
