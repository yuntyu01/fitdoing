import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { addDays, dateKey, parseDateKey, weekKey, weekdayMon0 } from '../../../domain/time';
import { useThemedStyles, usePalette, type Palette } from '../../../ui/theme';
import { fonts, layout, radius } from '../../../ui/tokens';

type Wd = '0' | '1' | '2' | '3' | '4' | '5' | '6';

/** 날짜 제목 + "N일째 기록 중" + 이번 주 요일 줄. 기록한 지난 날은 날짜 대신 작은 체크, 오늘만 얇은 테두리. */
export function DateCard({
  now,
  streak,
  loggedDays,
  topInset = 0,
}: {
  now: Date;
  streak: number;
  loggedDays: Set<string>;
  topInset?: number; // 상태 표시줄 높이
}) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const monday = parseDateKey(weekKey(now));
  const today = dateKey(now);
  const wd = String(weekdayMon0(now)) as Wd;

  return (
    <View style={[styles.wrap, { paddingTop: topInset + 4 }]}>
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
          const done = !isToday && key < today && loggedDays.has(key);
          return (
            <View key={key} style={[styles.day, isToday && styles.today]}>
              <Text style={[styles.wd, isToday && styles.onText]}>{t(`weekdayShort.${String(i) as Wd}`)}</Text>
              <View style={styles.numBox}>
                {done ? (
                  <Check size={18} color={c.sub} strokeWidth={2} accessibilityLabel="done" />
                ) : (
                  <Text style={[styles.num, isToday && styles.numToday]}>{d.getDate()}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {},
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: layout.labelGap,
      paddingHorizontal: layout.header,
      marginBottom: 20, // 시안: 날짜 제목 → 요일 줄 (글자 사이 약 25)
    },
    date: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 25, lineHeight: 32, color: c.text },
    streak: { fontFamily: fonts.regular, fontSize: 14, color: c.sub },
    week: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: layout.strip },
    day: {
      flex: 1,
      maxWidth: 50,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: radius.day,
      borderWidth: layout.hairline,
      borderColor: 'transparent',
      gap: 4,
    },
    today: { borderColor: c.focus },
    wd: { fontFamily: fonts.regular, fontSize: 13, color: c.sub },
    onText: { fontFamily: fonts.semibold, color: c.text },
    numBox: { height: 24, justifyContent: 'center' },
    num: { fontFamily: fonts.regular, fontSize: 18, color: c.text, fontVariant: ['tabular-nums'] },
    numToday: { fontFamily: fonts.bold },
  });
