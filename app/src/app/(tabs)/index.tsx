import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettingsValue } from '../../features/settings/store';
import { CameraFab, FAB_CLEARANCE } from '../../features/today/components/CameraFab';
import { DateCard } from '../../features/today/components/DateCard';
import { MealTable } from '../../features/today/components/MealTable';
import { TileRow } from '../../features/today/components/TileRow';
import { TotalsCard } from '../../features/today/components/TotalsCard';
import { useNow, useToday } from '../../features/today/useToday';
import { useWeeklyRows } from '../../features/weekly/useWeeklyRows';
import { WeeklyCard } from '../../features/weekly/WeeklyCard';
import { useTabBarSpace } from '../../ui/FloatingTabBar';
import { BottomFade, GlassScope, ScreenGradient } from '../../ui/glass';
import { useThemedStyles, type Palette } from '../../ui/theme';
import { glass } from '../../ui/tokens';

const URGENT_MS = 10 * 60_000;

// 홈은 유리 디자인: 안쪽 모든 부품이 유리 색을 쓴다.
export default function TodayScreen() {
  return (
    <GlassScope>
      <TodayContent />
    </GlassScope>
  );
}

function TodayContent() {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace(); // 탭바가 내용 위에 떠 있어서 그만큼 띄운다
  const styles = useThemedStyles(makeStyles);
  const settings = useSettingsValue();
  const now = useNow();
  const data = useToday(settings, now);
  const weeklyRows = useWeeklyRows(now);

  const cur = data.current;
  const urgent = !!cur && cur.at.getTime() - now.getTime() <= URGENT_MS;
  const { height } = useWindowDimensions();

  return (
    <View style={styles.screen}>
      <ScreenGradient />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: tabSpace + FAB_CLEARANCE }}>
        <DateCard topInset={insets.top} now={now} streak={data.streak} loggedDays={data.loggedDays} />
        <View style={styles.tiles}>
          <TileRow data={data} settings={settings} now={now} />
        </View>
        <View style={styles.cards}>
          <TotalsCard
            style={styles.card}
            totals={data.totals}
            targets={settings.targets}
            loggedCount={data.loggedCount}
          />
          <MealTable data={data} targets={settings.targets} />
          <WeeklyCard
            style={styles.card}
            rows={weeklyRows}
            targets={settings.targets}
            history={settings.targetHistory}
            now={now}
          />
        </View>
      </ScrollView>
      <BottomFade height={tabSpace + 28} />
      {/* 상태 표시줄 자리: 스크롤한 카드가 시계·배터리 밑으로 지나가지 않게 같은 자리의 바탕을 잘라 덮는다 */}
      <View pointerEvents="none" style={[styles.statusBar, { height: insets.top }]}>
        <View style={{ height }}>
          <ScreenGradient />
        </View>
      </View>
      <CameraFab urgent={urgent} bottom={tabSpace} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1 },
    statusBar: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
    tiles: { marginTop: 14 },
    cards: { paddingHorizontal: glass.side, marginTop: 16, gap: glass.gap },
    card: { borderRadius: glass.cardRadius, paddingHorizontal: glass.cardPad }, // 기록 화면과 함께 쓰는 카드의 홈 치수
  });
