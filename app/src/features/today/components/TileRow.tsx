import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Settings } from '../../../db/schema';
import { colors, fonts, radius, space } from '../../../ui/tokens';
import { formatRemaining, hhmm } from '../format';
import type { TodayData } from '../useToday';

const GAP = 8;
const VISIBLE = 4;
const GYM_WIDEN = 1.12; // 헬스 타일은 "헬스 · 3/5"가 들어가도록 조금 넓게

/**
 * 끼니 타일 + 헬스 타일 가로 줄. 현재 마감 타일만 검정.
 * 4개가 넘으면 가로 스크롤하고, 현재 타일이 보이는 4칸 중 세 번째에 오게 굴린다 (시안).
 */
export function TileRow({ data, settings, now }: { data: TodayData; settings: Settings; now: Date }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const ref = useRef<ScrollView>(null);

  const count = data.meals.length + (settings.gym.enabled ? 1 : 0);
  const avail = width - space.edge * 2;
  // 4개 이하면 딱 맞게, 넘으면 4칸이 딱 보이게 하고 나머지는 옆으로 민다.
  const scrolls = count > VISIBLE;
  const tileW = scrolls
    ? (avail - GAP * (VISIBLE - 1)) / (VISIBLE - 1 + (settings.gym.enabled ? GYM_WIDEN : 1))
    : (avail - GAP * (count - 1)) / count;
  const gymW = scrolls ? tileW * GYM_WIDEN : tileW;

  const currentIdx = data.meals.findIndex((m) => m.state === 'current');
  useEffect(() => {
    if (count <= VISIBLE || currentIdx < 0) return;
    const first = Math.min(Math.max(0, currentIdx - 2), count - VISIBLE);
    ref.current?.scrollTo({ x: first * (tileW + GAP), animated: false });
  }, [currentIdx, count, tileW]);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEnabled={count > VISIBLE}
      contentContainerStyle={styles.row}
    >
      {data.meals.map((m) => {
        const on = m.state === 'current';
        let sub: string;
        if (m.state === 'logged') sub = m.loggedAt ? hhmm(new Date(m.loggedAt)) : '';
        else if (m.state === 'current') sub = formatRemaining(t, m.at.getTime() - now.getTime());
        else if (m.state === 'missed') sub = t('home.missed');
        else sub = t('common.until', { time: hhmm(m.at) });

        return (
          <View key={m.index} style={[styles.tile, { width: tileW }, on && styles.tileOn]}>
            <Text style={[styles.title, on && styles.textOn, on && styles.center]}>
              {t('common.meal', { n: m.index })}
            </Text>
            <View style={[styles.subRow, on && styles.center]}>
              {m.state === 'logged' ? <View style={styles.dot} /> : null}
              <Text
                style={[styles.sub, on && styles.subOn, m.state === 'missed' && styles.missed]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {sub}
              </Text>
            </View>
          </View>
        );
      })}
      {settings.gym.enabled ? (
        <Pressable style={[styles.tile, { width: gymW }]} onPress={() => router.push('/gym')}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            {t('gym.title')}
            <Text style={styles.gymCount}>
              {' '}
              · {data.gym.done}/{data.gym.planned}
            </Text>
          </Text>
          <Text style={styles.sub} numberOfLines={1} adjustsFontSizeToFit>
            {data.gym.doneToday
              ? t('home.gymDone')
              : data.gym.today
                ? t('common.until', { time: settings.gym.arriveBy })
                : t('home.gymRest')}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.edge, gap: GAP },
  tile: {
    height: 79,
    borderRadius: radius.tile,
    backgroundColor: colors.card,
    paddingHorizontal: space.m - 4,
    justifyContent: 'center',
    gap: 3,
  },
  tileOn: { backgroundColor: colors.accent },
  center: { alignSelf: 'center', textAlign: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  textOn: { color: colors.onAccent },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: colors.sub, fontVariant: ['tabular-nums'] },
  subOn: { fontFamily: fonts.bold, fontSize: 17, color: colors.onAccent },
  missed: { color: colors.faint },
  gymCount: { fontFamily: fonts.regular, fontSize: 14, color: colors.sub },
});
