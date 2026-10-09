import { useRouter, type Href } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Settings } from '../../db/schema';
import { formatDistance } from '../../domain/geo';
import { formatCountdown } from '../../domain/lock';
import { startOfDay } from '../../domain/time';
import { releaseGymLock, spendRestCoupon } from '../../features/lock/actions';
import { HoldConfirm, useHold } from '../../features/lock/components/HoldAction';
import { ContactRow, LockFrame, LockStats, LockTimer, TextActions } from '../../features/lock/components/LockFrame';
import { useLock } from '../../features/lock/store';
import { useGymArrival } from '../../features/lock/useGymArrival';
import { useLockOfType } from '../../features/lock/useLockOfType';
import { useSettings } from '../../features/settings/store';
import { hhmm } from '../../features/today/format';
import { useToday } from '../../features/today/useToday';
import { FullButton } from '../../ui/FullButton';
import { usePalette } from '../../ui/theme';

const fmt = (m: number) => {
  const d = formatDistance(m);
  return `${d.value}${d.unit}`;
};

export default function GymLock() {
  const { t } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const { lock, now } = useLockOfType('gym');
  const settings = useSettings((s) => s.settings);
  const restLeft = useLock((s) => s.restLeft);
  const distance = useGymArrival(settings?.gym ?? { lat: null, lng: null, radiusM: 150 }, () =>
    releaseGymLock('geofence'),
  );
  const hold = useHold('coupon', () => spendRestCoupon());
  if (!lock || !settings) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const photo = () => {
    try {
      router.push('/capture?purpose=gym' as Href); // 촬영 화면이 아직 없어도 크래시하지 않는다
    } catch {}
  };

  const desc =
    distance.status === 'ok'
      ? t('lock.gymTitleDistance', { distance: fmt(distance.meters) })
      : distance.status === 'pending'
        ? t('lock.gymDescLocating')
        : t('lock.gymDescUnavailable');

  return (
    <LockFrame
      label={t('lock.typeGym')}
      title={t('lock.gymDeadline')}
      desc={desc}
      footer={
        hold.active ? (
          <HoldConfirm hold={hold} />
        ) : (
          <>
            <ContactRow kinds={['call', 'sms', 'map', 'kakao']} />
            <FullButton
              // 위치가 안 잡히면 사진 인증이 유일한 길이라 그 사실을 버튼에 적는다.
              label={distance.status === 'unavailable' ? t('lock.gymPhoto') : t('lock.verifyGym')}
              icon={<Camera size={20} color={c.onPrimary} strokeWidth={1.8} />}
              onPress={photo}
            />
            <TextActions
              items={[
                {
                  label: restLeft > 0 ? t('lock.restCoupon', { n: restLeft }) : t('lock.restNone'),
                  disabled: restLeft <= 0,
                  onPress: hold.start,
                },
              ]}
            />
          </>
        )
      }
    >
      <LockTimer
        caption={t('lock.timerLeft')}
        value={formatCountdown(lock.until - now)}
        note={t('lock.releaseAt', { time: hhmm(new Date(lock.until)) })}
      />
      <GymStats settings={settings} now={now} />
    </LockFrame>
  );
}

/** 오늘 인증 · 이번 주 n / m회 */
function GymStats({ settings, now }: { settings: Settings; now: number }) {
  const { t } = useTranslation();
  // 1초마다 바뀌는 now 대신 그날 0시를 넘겨 이번 주 계산을 매초 다시 하지 않는다.
  const dayMs = startOfDay(new Date(now)).getTime();
  const day = useMemo(() => new Date(dayMs), [dayMs]);
  const data = useToday(settings, day);
  return (
    <LockStats
      items={[
        { label: t('lock.statToday'), value: t('lock.notVerified') },
        {
          label: t('lock.statWeek'),
          value: t('lock.weekCount', { done: data.gym.done, planned: data.gym.planned }),
        },
      ]}
    />
  );
}
