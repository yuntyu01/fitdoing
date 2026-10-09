import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dateKey, parseDateKey } from '../domain/time';
import { GymSection, LockSection, MealSection } from '../features/records/DaySections';
import { kcalText, macroText } from '../features/records/format';
import { useDayRecords } from '../features/records/useDayRecords';
import { CenterHeader } from '../ui/Headers';
import { Screen } from '../ui/Screen';
import { useThemedStyles, type Palette } from '../ui/theme';
import { fonts, layout, text } from '../ui/tokens';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 하루 상세 (/day?date=YYYY-MM-DD): 그날 합계, 끼니마다 사진·음식·합계(수정), 헬스, 잠금. 날짜가 없으면 오늘. */
export default function DayScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date && DATE_RE.test(params.date) ? params.date : dateKey(new Date());
  const d = parseDateKey(date);
  const rec = useDayRecords(date);
  const locked = rec.locks.length > 0 || rec.lockedMeals.length > 0;
  const empty = rec.meals.length === 0 && !rec.gym && !locked;

  // 링크로 바로 열렸으면 돌아갈 곳이 없으니 기록 탭으로
  const back = () => (router.canGoBack() ? router.back() : router.replace('/records'));

  return (
    <Screen
      header={<CenterHeader title={t('day.title', { month: d.getMonth() + 1, day: d.getDate() })} onBack={back} />}
      bottomSpace={insets.bottom + layout.block * 2}
      gap={layout.block + 4}
    >
      {rec.meals.length > 0 ? (
        <Text style={styles.totals}>
          <Text style={styles.kcal}>{kcalText(rec.totals.kcal)}</Text>
          {` ${t('common.kcal')} · ${macroText(t, rec.totals)}`}
        </Text>
      ) : null}

      {empty ? <Text style={styles.empty}>{t('day.empty')}</Text> : null}

      {rec.meals.map((m) => (
        <MealSection
          key={m.index}
          meal={m}
          // 기록 확인 화면을 수정 모드로 연다: 이 날·이 끼니를 덮어쓴다
          onEdit={() =>
            router.push({ pathname: '/capture/review', params: { date, index: String(m.index), edit: '1' } })
          }
        />
      ))}
      {rec.gym ? <GymSection gym={rec.gym} /> : null}
      {locked ? <LockSection locks={rec.locks} lockedMeals={rec.lockedMeals} /> : null}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    totals: { ...text.body, color: c.sub, textAlign: 'center', marginTop: 8, fontVariant: ['tabular-nums'] },
    kcal: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 32, color: c.text },
    empty: { ...text.body, color: c.sub, textAlign: 'center', marginTop: layout.block },
  });
