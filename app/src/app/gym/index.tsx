import { desc, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, type Href } from 'expo-router';
import { Camera, Check, Dumbbell } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { db } from '../../db/client';
import { gymLogs } from '../../db/schema';
import { formatDistance } from '../../domain/geo';
import { addDays, atMinutes, dateKey, parseDateKey, toMinutes, weekKey, weekdayMon0 } from '../../domain/time';
import { useRestCoupon } from '../../features/coupons/useCoupons';
import { useGymDistance } from '../../features/location/useGymDistance';
import { useSettingsValue } from '../../features/settings/store';
import { formatRemaining, hhmm } from '../../features/today/format';
import { useNow, useToday } from '../../features/today/useToday';
import { Card, Divider } from '../../ui/Card';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { layout, radius, text } from '../../ui/tokens';

// 사진 인증(촬영) 화면은 다른 작업에서 만든다. 라우트가 생기면 true로 바꾼다.
const VERIFY_ROUTE_READY = true;
const VERIFY_HREF = '/capture?purpose=gym' as Href;
const RECENT = 5;

type Wd = '0' | '1' | '2' | '3' | '4' | '5' | '6';
type GymLog = typeof gymLogs.$inferSelect;

export default function GymDetailScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const settings = useSettingsValue();
  const now = useNow();
  const data = useToday(settings, now);
  const { gym } = settings;
  const dist = useGymDistance(gym);
  const rest = useRestCoupon();
  // 인증한 날(위치·사진·휴식권). 사진은 저장하지 않으니 목록에는 아이콘만 둔다.
  const { data: logs } = useLiveQuery(
    db.select().from(gymLogs).where(isNotNull(gymLogs.verifiedBy)).orderBy(desc(gymLogs.date)).limit(30),
  );
  const sorted = [...logs].sort((a, b) => (a.date < b.date ? 1 : -1));
  const todayKey = dateKey(now);
  const todayLog = sorted.find((l) => l.date === todayKey);

  const arriveAt = atMinutes(now, toMinutes(gym.arriveBy));
  const leftMs = arriveAt.getTime() - now.getTime();

  let status: string;
  let side: string | null = null;
  if (data.gym.doneToday) {
    status = todayLog?.verifiedBy === 'rest' ? t('gymDetail.restUsed') : t('gymDetail.verified');
    if (todayLog?.checkInAt && todayLog.verifiedBy !== 'rest') side = hhmm(new Date(todayLog.checkInAt));
  } else if (!data.gym.today) {
    status = t('gymDetail.restDay');
  } else {
    status = t('gymDetail.before');
    side = t('gymDetail.until', { time: gym.arriveBy });
  }

  const canAct = !data.gym.doneToday;
  const waiting = data.gym.today && canAct;

  const verify = () => {
    if (VERIFY_ROUTE_READY) router.push(VERIFY_HREF);
    else Alert.alert(t('common.comingSoon'));
  };

  const restNote = rest.confirmed
    ? t('gymDetail.restConfirmed')
    : !rest.status.rest.left && canAct
      ? t('gymDetail.restNone')
      : null;

  return (
    <Screen
      header={<SubHeader title={t('gymDetail.title')} onBack={() => router.back()} />}
      footer={
        <>
          {restNote ? <Text style={styles.footNote}>{restNote}</Text> : null}
          <FullButton
            label={t('gymDetail.verifyWorkout')}
            icon={<Camera size={20} color={c.onPrimary} strokeWidth={1.8} />}
            onPress={verify}
            disabled={!canAct}
          />
          {rest.secondsLeft !== null ? (
            <FullButton
              variant="text"
              label={t('gymDetail.restCancel', { n: rest.secondsLeft })}
              onPress={rest.cancel}
            />
          ) : (
            <FullButton
              variant="text"
              label={t('gymDetail.rest', { left: rest.status.rest.left, total: rest.status.rest.total })}
              onPress={rest.start}
              disabled={!canAct || !rest.canUse}
            />
          )}
        </>
      }
    >
      <View style={styles.today}>
        <Text style={styles.caption}>{t('gymDetail.todayLabel')}</Text>
        <View style={styles.statusRow}>
          <Text style={styles.status}>{status}</Text>
          {side ? <Text style={styles.side}>{side}</Text> : null}
        </View>
      </View>

      <Card style={styles.weekCard}>
        <Text style={styles.caption}>{t('gymDetail.week')}</Text>
        <Text>
          <Text style={styles.countDone}>{data.gym.done}</Text>
          <Text style={styles.countRest}> {t('gymDetail.weekOf', { planned: data.gym.planned })}</Text>
        </Text>
        {data.gym.planned > 0 ? <Segments done={data.gym.done} planned={data.gym.planned} /> : null}
      </Card>

      <View>
        <Text style={styles.heading}>{t('gymDetail.schedule')}</Text>
        <WeekRow now={now} days={gym.days} verified={new Set(sorted.map((l) => l.date))} />
      </View>

      <View>
        {waiting ? (
          <ListRow
            label={t('gymDetail.timeLabel')}
            value={leftMs > 0 ? formatRemaining(t, leftMs) : t('gymDetail.passed')}
          />
        ) : null}
        <ListRow
          label={t('gymDetail.distance')}
          right={<Distance state={dist.state} onAsk={dist.request} onRetry={dist.refresh} />}
        />
        {/* 주소는 길 수 있어 값 칸(한 줄) 대신 이름 아래 설명으로 둔다 */}
        <ListRow label={gym.name || t('gym.defaultName')} desc={gym.address || t('gymDetail.noAddress')} />
      </View>

      <View>
        <Text style={styles.heading}>{t('gymDetail.recent')}</Text>
        {sorted.length === 0 ? (
          <Text style={styles.empty}>{t('gymDetail.recentEmpty')}</Text>
        ) : (
          sorted.slice(0, RECENT).map((l, i) => (
            <View key={l.date}>
              {i > 0 ? <Divider /> : null}
              <RecentRow log={l} />
            </View>
          ))
        )}
        <Divider />
        <ListRow label={t('gymDetail.editPlan')} onPress={() => router.push('/edit/gym' as Href)} />
      </View>
    </Screen>
  );
}

/** 주간 목표 칸: 한 일 = 막대색, 남은 칸 = 바탕색 */
function Segments({ done, planned }: { done: number; planned: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.segments}>
      {Array.from({ length: planned }, (_, i) => (
        <View key={i} style={[styles.segment, i < done && styles.segmentOn]} />
      ))}
    </View>
  );
}

/** 월~일 줄. 인증한 날 아래 작은 체크, 계획했지만 아직 안 한 날은 대시, 오늘은 숫자에 얇은 테두리. */
function WeekRow({ now, days, verified }: { now: Date; days: number[]; verified: Set<string> }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const monday = parseDateKey(weekKey(now));
  const today = dateKey(now);
  return (
    <View style={styles.week}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i);
        const key = dateKey(d);
        const isToday = key === today;
        const planned = days.includes(weekdayMon0(d));
        return (
          <View key={key} style={styles.day}>
            <Text style={styles.wd}>{t(`weekdayShort.${String(i) as Wd}`)}</Text>
            <View style={[styles.num, isToday && styles.numToday]}>
              <Text style={[styles.numText, isToday && styles.numTextToday]}>{d.getDate()}</Text>
            </View>
            <View style={styles.mark}>
              {verified.has(key) ? (
                <Check size={16} color={c.text} strokeWidth={2.2} accessibilityLabel="done" />
              ) : planned ? (
                <View style={styles.dash} />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RecentRow({ log }: { log: GymLog }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const d = parseDateKey(log.date);
  const wd = String(weekdayMon0(d)) as Wd;
  const main =
    log.verifiedBy === 'rest'
      ? t('gymDetail.restUsed')
      : log.checkInAt
        ? t('gymDetail.recentDone', { time: hhmm(new Date(log.checkInAt)) })
        : t('gymDetail.verified');
  const how =
    log.verifiedBy === 'geofence'
      ? t('gymDetail.byGeofence')
      : log.verifiedBy === 'photo'
        ? t('gymDetail.byPhoto')
        : null;
  return (
    <View style={styles.recent}>
      <View style={styles.recentIcon}>
        <Dumbbell size={18} color={c.sub} strokeWidth={1.8} />
      </View>
      <View style={styles.recentText}>
        <Text style={styles.recentDate}>
          {t('date.full', { month: d.getMonth() + 1, day: d.getDate(), weekday: t(`weekdayLong.${wd}`) })}
        </Text>
        <Text style={styles.recentMain}>{main}</Text>
      </View>
      {how ? <Text style={styles.recentHow}>{how}</Text> : null}
    </View>
  );
}

function Distance({
  state,
  onAsk,
  onRetry,
}: {
  state: ReturnType<typeof useGymDistance>['state'];
  onAsk: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  if (state.status === 'ok') {
    const d = formatDistance(state.meters);
    return (
      <Text style={styles.value}>
        {d.value}
        {d.unit}
      </Text>
    );
  }
  if (state.status === 'loading') return <Text style={styles.value}>{t('gymDetail.locating')}</Text>;
  if (state.status === 'noPlace') return <Text style={styles.value}>{t('gymDetail.noPlace')}</Text>;
  const denied = state.status === 'denied';
  return (
    <Pressable onPress={denied ? onAsk : onRetry} hitSlop={8}>
      <Text style={styles.link}>{denied ? t('gymDetail.allowLocation') : t('gymDetail.retry')}</Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    today: { gap: 4, marginTop: 12 },
    caption: { ...text.caption, color: c.sub },
    statusRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
    status: { ...text.number, color: c.text, flexShrink: 1, fontVariant: ['tabular-nums'] },
    side: { ...text.body, color: c.sub, fontVariant: ['tabular-nums'] },
    weekCard: { gap: layout.related, padding: 20 },
    countDone: { ...text.number, color: c.text, fontVariant: ['tabular-nums'] },
    countRest: { ...text.heading, color: c.text, fontVariant: ['tabular-nums'] },
    segments: { flexDirection: 'row', gap: 6, marginTop: 6 },
    segment: { flex: 1, height: 8, borderRadius: 4, backgroundColor: c.track },
    segmentOn: { backgroundColor: c.bar },
    heading: { ...text.heading, color: c.text, marginBottom: 12 },
    week: { flexDirection: 'row', justifyContent: 'space-between' },
    day: { flex: 1, alignItems: 'center', gap: 6 },
    wd: { ...text.caption, color: c.sub },
    num: {
      minWidth: 36,
      height: 32,
      paddingHorizontal: 4,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    numToday: { borderColor: c.focus },
    numText: { ...text.label, color: c.text, fontVariant: ['tabular-nums'] },
    numTextToday: { fontFamily: text.heading.fontFamily },
    mark: { height: 16, justifyContent: 'center', alignItems: 'center' },
    dash: { width: 8, height: 1.5, borderRadius: 1, backgroundColor: c.faint },
    value: { ...text.body, color: c.sub, fontVariant: ['tabular-nums'] },
    link: { ...text.bodyMedium, color: c.text, textDecorationLine: 'underline' },
    empty: { ...text.body, color: c.sub, paddingVertical: 12 },
    recent: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
    recentIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.field,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recentText: { flex: 1, gap: 2 },
    recentDate: { ...text.caption, color: c.sub },
    recentMain: { ...text.bodyMedium, color: c.text, fontVariant: ['tabular-nums'] },
    recentHow: { ...text.caption, color: c.sub },
    footNote: { ...text.caption, color: c.sub, textAlign: 'center' },
  });
