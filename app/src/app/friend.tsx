import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Ellipsis, Info } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dateKey, parseDateKey, weekdayMon0 } from '../domain/time';
import { friendMenu } from '../features/friends/actions';
import { DayTimeline } from '../features/friends/components/DayTimeline';
import { ErrorView, Loading } from '../features/friends/components/States';
import { buildTimeline, useFriendDay } from '../features/friends/data';
import { SubHeader } from '../ui/Headers';
import { Screen } from '../ui/Screen';
import { usePalette, useThemedStyles, type Palette } from '../ui/theme';
import { fonts, text } from '../ui/tokens';

type Wd = '0' | '1' | '2' | '3' | '4' | '5' | '6';

/**
 * 친구의 하루 (/friend?id=&date=, date 없으면 오늘): 날짜·요약, 시간 흐름 목록(기록마다 응원·댓글), 공유 안내.
 * 친구가 공유한 기록만 서버가 준다.
 */
export default function FriendDayScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const [today] = useState(() => dateKey(new Date()));
  const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const { day, loading, error, refresh } = useFriendDay(id, date);
  const items = useMemo(() => (day ? buildTimeline(day) : []), [day]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/friends' as Href));

  const header = (
    <SubHeader
      title={day ? t('friends.dayTitle', { name: day.friend.name }) : t('friends.title')}
      onBack={back}
      right={
        day ? (
          <Pressable
            onPress={() => friendMenu(t, day.friend, { onRemoved: back })}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('friends.more')}
          >
            <Ellipsis size={22} color={c.text} strokeWidth={1.8} />
          </Pressable>
        ) : undefined
      }
    />
  );

  if (!day) {
    return (
      <Screen header={header}>
        {loading ? (
          <Loading />
        ) : (
          <ErrorView
            error={error ?? 'notFound'}
            onRetry={error && error !== 'notFound' ? () => void refresh() : undefined}
          />
        )}
      </Screen>
    );
  }

  const d = parseDateKey(day.date);
  const dateText = t('date.full', {
    month: d.getMonth() + 1,
    day: d.getDate(),
    weekday: t(`weekdayLong.${String(weekdayMon0(d)) as Wd}`),
  });
  const sum = day.summary;
  const gymText = sum.gymDone ? t('friends.dayGymDone') : sum.gymPlanned ? t('friends.dayGymPlanned') : null;

  return (
    <Screen header={header} gap={0}>
      <View style={styles.top}>
        <Text style={styles.date}>{dateText}</Text>
        <Text style={styles.sub}>
          {`${t('friends.dayMeals')} `}
          <Text style={styles.strong}>{`${sum.logged} / ${sum.meals}`}</Text>
          {` ${t('friends.dayLogged')}`}
          {gymText ? ` · ${gymText}` : ''}
        </Text>
      </View>

      {items.length > 0 ? (
        <DayTimeline items={items} />
      ) : (
        <Text style={[styles.sub, styles.empty]}>{t('friends.dayEmpty')}</Text>
      )}

      <View style={styles.note}>
        <Info size={14} color={c.sub} strokeWidth={1.8} />
        <Text style={styles.noteText}>{t('friends.sharedOnly')}</Text>
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    top: { marginTop: 8, marginBottom: 12, gap: 4 },
    date: { ...text.label, fontFamily: fonts.medium, color: c.text },
    sub: { ...text.body, color: c.sub },
    strong: { fontFamily: fonts.semibold, color: c.text, fontVariant: ['tabular-nums'] },
    empty: { paddingVertical: 24 },
    note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
    noteText: { ...text.caption, color: c.sub, flexShrink: 1 },
  });
