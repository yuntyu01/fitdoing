import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettingsValue } from '../../features/settings/store';
import { useWeeklyRows } from '../../features/weekly/useWeeklyRows';
import { WeeklyCard } from '../../features/weekly/WeeklyCard';
import { CameraFab } from '../../features/today/components/CameraFab';
import { DateCard } from '../../features/today/components/DateCard';
import { MealTable } from '../../features/today/components/MealTable';
import { TileRow } from '../../features/today/components/TileRow';
import { TotalsCard } from '../../features/today/components/TotalsCard';
import { hhmm } from '../../features/today/format';
import { useNow, useToday } from '../../features/today/useToday';
import { colors, space, type } from '../../ui/tokens';

const URGENT_MS = 10 * 60_000;

export default function TodayScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <DateCard topInset={insets.top} now={now} streak={data.streak} loggedDays={data.loggedDays} />
        <View style={styles.tiles}>
          <TileRow data={data} settings={settings} now={now} />
          <Text style={styles.guide}>{guide}</Text>
        </View>
        <View style={styles.cards}>
          <TotalsCard totals={data.totals} targets={settings.targets} loggedCount={data.loggedCount} />
          <MealTable data={data} targets={settings.targets} />
          <WeeklyCard rows={weeklyRows} targets={settings.targets} now={now} />
        </View>
      </ScrollView>
      <CameraFab urgent={urgent} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tiles: { marginTop: space.gap, gap: space.s },
  guide: { ...type.caption, fontSize: 12, textAlign: 'center' },
  cards: { paddingHorizontal: space.edge, marginTop: space.gap, gap: space.gap },
});
