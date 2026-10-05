import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { addDays, dateKey, parseDateKey, weekKey, weekdayMon0 } from '../../../domain/time';
import { colors, fonts, radius, space } from '../../../ui/tokens';

type Wd = '0' | '1' | '2' | '3' | '4' | '5' | '6';

/** 날짜 + "N일째 기록 중" + 이번 주 요일 줄 (오늘 박스, 기록한 날 점) */
export function DateCard({
  now,
  streak,
  loggedDays,
  topInset = 0,
}: {
  now: Date;
  streak: number;
  loggedDays: Set<string>;
  topInset?: number; // 상태 표시줄 높이. 시안처럼 카드가 그 뒤까지 올라간다.
}) {
  const { t } = useTranslation();
  const monday = parseDateKey(weekKey(now));
  const today = dateKey(now);
  const wd = String(weekdayMon0(now)) as Wd;

  return (
    <View style={[styles.card, { paddingTop: topInset + space.xs }]}>
      <View style={styles.head}>
        <Text style={styles.date}>
          {t('date.full', { month: now.getMonth() + 1, day: now.getDate(), weekday: t(`weekdayLong.${wd}`) })}
        </Text>
        <Text style={styles.streak}>{streak > 0 ? t('home.streak', { n: streak }) : t('home.streakZero')}</Text>
      </View>
      <View style={styles.week}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(monday, i);
          const key = dateKey(d);
          const isToday = key === today;
          return (
            <View key={key} style={[styles.day, isToday && styles.today]}>
              <Text style={styles.wd}>{t(`weekdayShort.${String(i) as Wd}`)}</Text>
              <Text style={styles.num}>{d.getDate()}</Text>
              <View style={[styles.dot, !loggedDays.has(key) && styles.dotHidden]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    marginHorizontal: space.edge,
    paddingHorizontal: space.edge,
    paddingBottom: space.m,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.s,
    marginBottom: space.s + space.xs,
  },
  date: { fontFamily: fonts.bold, fontSize: 23, color: colors.text },
  streak: { fontFamily: fonts.regular, fontSize: 14, color: colors.sub },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 47,
    alignItems: 'center',
    paddingVertical: space.s,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 2,
  },
  today: { borderColor: colors.faint },
  wd: { fontFamily: fonts.regular, fontSize: 13, color: colors.sub },
  num: { fontFamily: fonts.medium, fontSize: 17, color: colors.text, fontVariant: ['tabular-nums'] },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.text },
  dotHidden: { opacity: 0 },
});
