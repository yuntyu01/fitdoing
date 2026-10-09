import { ChevronRight, Utensils } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DayDetail } from '../../domain/records';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, layout, radius, text } from '../../ui/tokens';
import { clock, eatenFoodNames, fullDate, kcalText, macroText, type MealRow } from './format';

const THUMB = 60;

/**
 * 달력에서 고른 날 (상자 없음): 날짜 제목 + 오른쪽 상태, 요약 한 줄, 합계 한 줄, 기록한 끼니 줄(사진·끼니·시각·음식 이름).
 * 끼니 줄을 누르면 하루 상세로 간다.
 */
export function DayCard({
  detail,
  meals,
  isToday,
  onOpen,
}: {
  detail: DayDetail;
  meals: MealRow[]; // 그날 기록한 끼니 (1끼부터)
  isToday: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const { totals } = detail;

  const status = isToday ? t('records.inProgress') : detail.state === 'full' ? t('records.dayDone') : null;
  const summary = [
    meals.length > 0 ? t('records.mealsLogged', { n: meals.length }) : null,
    detail.gym ? t('records.gymDone') : null,
    detail.locked ? t('records.lockedYes') : null,
    detail.sleep ? t('records.sleepDone') : null,
  ].filter(Boolean);

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.date}>{fullDate(t, detail.date)}</Text>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>

      {detail.empty ? (
        <Text style={styles.empty}>{t('records.dayEmpty')}</Text>
      ) : (
        <View style={styles.lines}>
          <Text style={styles.summary}>{summary.join(' · ')}</Text>
          {meals.length > 0 ? (
            <Text style={styles.totals}>
              <Text style={styles.kcal}>
                {kcalText(totals.kcal)} {t('common.kcal')}
              </Text>
              {` · ${macroText(t, totals)}`}
            </Text>
          ) : null}
        </View>
      )}

      {meals.length > 0 ? (
        <View style={styles.list}>
          {meals.map((m) => {
            const foods = eatenFoodNames(t, m); // 음식별 먹은 양이 100%가 아니면 "현미밥 75%"
            return (
              <Pressable
                key={m.index}
                onPress={onOpen}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <View style={styles.thumb}>
                  {m.photoUri ? (
                    <Image
                      source={{ uri: m.photoUri }}
                      style={styles.img}
                      accessibilityLabel={t('records.mealPhoto', { n: m.index })}
                    />
                  ) : (
                    <Utensils size={20} color={c.faint} strokeWidth={1.8} />
                  )}
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.meta}>
                    {[t('common.meal', { n: m.index }), clock(m.loggedAt)].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={[styles.foods, !foods && styles.foodsMuted]} numberOfLines={2}>
                    {foods ?? t('records.noItems')}
                  </Text>
                </View>
                <ChevronRight size={18} color={c.sub} strokeWidth={1.8} />
              </Pressable>
            );
          })}
        </View>
      ) : !detail.empty ? (
        // 끼니 기록은 없어도 헬스·잠금 기록은 하루 상세에서 볼 수 있게
        <Pressable onPress={onOpen} style={({ pressed }) => [styles.open, pressed && styles.pressed]} hitSlop={8}>
          <Text style={styles.openText}>{t('records.openDay')}</Text>
          <ChevronRight size={16} color={c.sub} strokeWidth={1.8} />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: layout.related },
    date: { ...text.heading, fontSize: 20, lineHeight: 28, fontFamily: fonts.bold, color: c.text, flexShrink: 1 },
    status: { ...text.caption, color: c.sub },
    empty: { ...text.body, color: c.sub, marginTop: layout.related },
    lines: { marginTop: layout.related, gap: 4 },
    summary: { ...text.body, color: c.text },
    totals: { ...text.body, color: c.sub, fontVariant: ['tabular-nums'] },
    kcal: { fontFamily: fonts.semibold, color: c.text },
    list: { marginTop: layout.inner, gap: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
    pressed: { opacity: 0.6 },
    thumb: {
      width: THUMB,
      height: THUMB,
      borderRadius: radius.field,
      backgroundColor: c.card,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    img: { width: '100%', height: '100%' },
    rowText: { flex: 1, gap: 2 },
    meta: { ...text.caption, color: c.sub, fontVariant: ['tabular-nums'] },
    foods: { ...text.label, color: c.text },
    foodsMuted: { color: c.sub },
    open: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: layout.inner, alignSelf: 'flex-start' },
    openText: { ...text.body, color: c.sub },
  });
