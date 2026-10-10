import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Settings } from '../../../db/schema';
import { dateKey } from '../../../domain/time';
import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius } from '../../../ui/tokens';
import { formatRemaining, hhmm } from '../format';
import type { TodayData } from '../useToday';

const W = layout.tile;
const GAP = layout.tileGap;
const STEP = W + GAP;
const TITLE_LH = 20;
const SUB_LH = 16;
const MEAL_GAP = 12; // 끼니 제목 ↔ 시간
const GYM_GAP = 4; // 헬스 제목 ↔ 횟수 ↔ 시간

/**
 * 끼니 타일 + 헬스 타일 가로 줄. 왼쪽부터 붙이고, 화면을 넘칠 때만 좌우로 끌 수 있다(타일 단위로 멈춘다).
 * 넘칠 때는 지금 기록할 끼니(없으면 다음 끼니, 그것도 없으면 마지막 타일)가 가운데 오도록 굴려 두되,
 * 양끝은 넘어가지 않는다(타일이 적으면 왼쪽에 빈칸을 만들지 않는다).
 * 지금 끼니는 진행 막대 색으로 채우고, 기록한 끼니는 오른쪽 위 모서리에 작은 체크. 기록한 끼니를 누르면 그 끼니 기록을 연다.
 */
export function TileRow({ data, settings, now }: { data: TodayData; settings: Settings; now: Date }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const ref = useRef<ScrollView>(null);

  const count = data.meals.length + (settings.gym.enabled ? 1 : 0);
  const side = layout.strip;
  let focus = data.meals.findIndex((m) => m.state === 'current');
  if (focus < 0) focus = data.meals.findIndex((m) => m.state === 'upcoming');
  if (focus < 0) focus = count - 1;
  const content = side * 2 + count * W + Math.max(0, count - 1) * GAP;
  const maxX = Math.max(0, content - width);
  const x = Math.min(maxX, Math.max(0, focus * STEP + side + W / 2 - width / 2));

  useEffect(() => {
    ref.current?.scrollTo({ x, animated: false });
  }, [x]);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentOffset={{ x, y: 0 }}
      snapToInterval={STEP}
      decelerationRate="fast"
      contentContainerStyle={[styles.row, { paddingHorizontal: side }]}
    >
      {data.meals.map((m) => {
        const on = m.state === 'current';
        let sub: string;
        if (m.state === 'logged') sub = m.loggedAt ? hhmm(new Date(m.loggedAt)) : '';
        else if (m.state === 'current') sub = formatRemaining(t, m.at.getTime() - now.getTime());
        else if (m.state === 'missed') sub = t('home.missed');
        else sub = t('common.until', { time: hhmm(m.at) });

        const logged = m.state === 'logged';
        return (
          <Pressable
            key={m.index}
            disabled={!logged}
            accessibilityRole={logged ? 'button' : undefined}
            onPress={() =>
              router.push({
                pathname: '/capture/review',
                params: { date: dateKey(data.day), index: String(m.index), edit: '1' },
              })
            }
            style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && styles.pressed]}
          >
            {m.state === 'logged' ? (
              <View style={styles.check}>
                <Check size={11} color={c.sub} strokeWidth={2.4} />
              </View>
            ) : null}
            <Text style={[styles.title, on && styles.textOn]}>{t('common.meal', { n: m.index })}</Text>
            <Text style={[styles.sub, styles.mealSub, on && styles.textOn, m.state === 'missed' && styles.faint]}>
              {sub}
            </Text>
          </Pressable>
        );
      })}
      {settings.gym.enabled ? (
        <Pressable style={styles.tile} onPress={() => router.push('/gym')}>
          {data.gym.doneToday ? (
            <View style={styles.check}>
              <Check size={11} color={c.sub} strokeWidth={2.4} />
            </View>
          ) : null}
          <Text style={styles.title}>{t('gym.title')}</Text>
          <Text style={[styles.sub, styles.gymSub]}>
            {t('home.gymCount', { done: data.gym.done, planned: data.gym.planned })}
          </Text>
          <Text style={[styles.sub, styles.gymSub]}>
            {data.gym.doneToday ? t('home.gymDone') : data.gym.today ? settings.gym.arriveBy : t('home.gymRest')}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { gap: GAP },
    // 모든 타일이 같은 정사각형(76). 내용은 가로·세로 가운데: 끼니 48(20 + 12 + 16), 헬스 60(20 + 4 + 16 + 4 + 16).
    tile: {
      width: W,
      height: W,
      borderRadius: radius.blockTile,
      backgroundColor: c.card,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileOn: { backgroundColor: c.bar },
    pressed: { opacity: 0.7 },
    check: { position: 'absolute', top: 6, right: 6 },
    title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: TITLE_LH, color: c.text, textAlign: 'center' },
    textOn: { fontFamily: fonts.bold, color: c.bg },
    sub: {
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: SUB_LH,
      color: c.sub,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    mealSub: { marginTop: MEAL_GAP },
    gymSub: { marginTop: GYM_GAP },
    faint: { color: c.faint },
  });
