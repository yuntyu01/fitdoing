import { router, type Href } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDistance } from '../../domain/geo';
import { atMinutes, toMinutes } from '../../domain/time';
import { useRestCoupon } from '../../features/coupons/useCoupons';
import { useGymDistance } from '../../features/location/useGymDistance';
import { useSettingsValue } from '../../features/settings/store';
import { formatRemaining } from '../../features/today/format';
import { useNow, useToday } from '../../features/today/useToday';
import { Card, Divider } from '../../ui/Card';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { colors, fonts, space, tabular, type } from '../../ui/tokens';

// 사진 인증(촬영) 화면은 다른 작업에서 만든다. 라우트가 생기면 true로 바꾼다.
const VERIFY_ROUTE_READY = true;
const VERIFY_HREF = '/capture?purpose=gym' as Href;

export default function GymDetailScreen() {
  const { t } = useTranslation();
  const settings = useSettingsValue();
  const now = useNow();
  const data = useToday(settings, now);
  const { gym } = settings;
  const dist = useGymDistance(gym);
  const rest = useRestCoupon();

  const arriveAt = atMinutes(now, toMinutes(gym.arriveBy));
  const leftMs = arriveAt.getTime() - now.getTime();

  let timeText: string;
  let timeNote: string;
  if (data.gym.doneToday) {
    timeText = t('home.gymDone');
    timeNote = t('gymDetail.doneNote');
  } else if (!data.gym.today) {
    timeText = t('home.gymRest');
    timeNote = t('gymDetail.restDayNote');
  } else if (leftMs <= 0) {
    timeText = t('gymDetail.passed');
    timeNote = t('gymDetail.passedNote', { time: gym.arriveBy });
  } else {
    timeText = formatRemaining(t, leftMs);
    timeNote = t('gymDetail.leftNote', { time: gym.arriveBy });
  }

  const canAct = !data.gym.doneToday;

  const verify = () => {
    if (VERIFY_ROUTE_READY) router.push(VERIFY_HREF);
    else Alert.alert(t('common.comingSoon'));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.pad}>
        <SubHeader title={t('gymDetail.title')} onBack={() => router.back()} />
      </View>
      <View style={styles.body}>
        <Card>
          <Text style={type.desc}>{t('gymDetail.timeLabel')}</Text>
          <Text style={styles.timer}>{timeText}</Text>
          <Text style={[type.desc, { marginTop: space.xs }]}>{timeNote}</Text>
        </Card>

        <Card style={styles.list}>
          <Row label={t('gymDetail.distance')}>
            <Distance state={dist.state} onAsk={dist.request} onRetry={dist.refresh} />
          </Row>
          <Divider />
          <Row label={t('gymDetail.week')}>
            <Text style={styles.value}>
              {data.gym.done}/{data.gym.planned}
            </Text>
          </Row>
          <Divider />
          <View style={styles.place}>
            <MapPin size={20} color={colors.text} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={styles.placeName}>{gym.name || t('gym.defaultName')}</Text>
              <Text style={type.desc}>{gym.address || t('gymDetail.noAddress')}</Text>
            </View>
          </View>
        </Card>

        {rest.confirmed ? <Text style={styles.confirmed}>{t('gymDetail.restConfirmed')}</Text> : null}
        {!rest.status.rest.left && canAct ? <Text style={styles.confirmed}>{t('gymDetail.restNone')}</Text> : null}
      </View>

      <View style={styles.footer}>
        <FullButton label={t('gymDetail.verify')} onPress={verify} disabled={!canAct} />
        {rest.secondsLeft !== null ? (
          <FullButton
            variant="secondary"
            label={t('gymDetail.restCancel', { n: rest.secondsLeft })}
            onPress={rest.cancel}
          />
        ) : (
          <FullButton
            variant="secondary"
            label={t('gymDetail.rest', { left: rest.status.rest.left, total: rest.status.rest.total })}
            onPress={rest.start}
            disabled={!canAct || !rest.canUse}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {children}
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
  if (state.status === 'ok') {
    const d = formatDistance(state.meters);
    return (
      <Text style={styles.value}>
        {d.value}
        {d.unit}
      </Text>
    );
  }
  if (state.status === 'loading') return <Text style={styles.sub}>{t('gymDetail.locating')}</Text>;
  if (state.status === 'noPlace') return <Text style={styles.sub}>{t('gymDetail.noPlace')}</Text>;
  const denied = state.status === 'denied';
  return (
    <Pressable onPress={denied ? onAsk : onRetry} hitSlop={8}>
      <Text style={styles.link}>{denied ? t('gymDetail.allowLocation') : t('gymDetail.retry')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space.gutter },
  body: { flex: 1, paddingHorizontal: space.gutter, paddingTop: space.m, gap: space.gap },
  timer: { ...type.timer, color: colors.text, marginTop: space.xs },
  list: { paddingVertical: space.xs },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: fonts.medium, fontSize: 17, color: colors.text },
  value: { fontFamily: fonts.bold, fontSize: 17, color: colors.text, ...tabular },
  sub: { ...type.desc },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, textDecorationLine: 'underline' },
  place: { flexDirection: 'row', gap: space.s, alignItems: 'flex-start', paddingVertical: space.m },
  placeName: { fontFamily: fonts.medium, fontSize: 17, color: colors.text },
  confirmed: { ...type.desc, textAlign: 'center' },
  footer: { paddingHorizontal: space.gutter, paddingBottom: space.s, gap: space.s },
});
