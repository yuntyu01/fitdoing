import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatDistance } from '../../domain/geo';
import { releaseGymLock, spendRestCoupon } from '../../features/lock/actions';
import { ContactRow, LockButton, LockDesc, LockFrame, LockTitle } from '../../features/lock/components/LockFrame';
import { HoldAction } from '../../features/lock/components/HoldAction';
import { useLock } from '../../features/lock/store';
import { useGymArrival } from '../../features/lock/useGymArrival';
import { useLockOfType } from '../../features/lock/useLockOfType';
import { useSettings } from '../../features/settings/store';
import { colors } from '../../ui/tokens';

const fmt = (m: number) => {
  const d = formatDistance(m);
  return `${d.value}${d.unit}`;
};

export default function GymLock() {
  const { t } = useTranslation();
  const router = useRouter();
  const { lock } = useLockOfType('gym');
  const gym = useSettings((s) => s.settings?.gym);
  const restLeft = useLock((s) => s.restLeft);
  const distance = useGymArrival(gym ?? { lat: null, lng: null, radiusM: 150 }, () => releaseGymLock('geofence'));
  if (!lock) return <View style={{ flex: 1, backgroundColor: colors.lockBg }} />;

  const photo = () => {
    try {
      router.push('/capture?purpose=gym' as Href); // 촬영 화면이 아직 없어도 크래시하지 않는다
    } catch {}
  };

  const title =
    distance.status === 'ok'
      ? t('lock.gymTitleDistance', { distance: fmt(distance.meters) })
      : t('lock.gymTitle');
  const desc =
    distance.status === 'ok'
      ? t('lock.gymDescOk')
      : distance.status === 'pending'
        ? t('lock.gymDescLocating')
        : t('lock.gymDescUnavailable');

  return (
    <LockFrame
      footer={
        <>
          <ContactRow kinds={['call', 'sms', 'map', 'kakao']} />
          <LockButton label={t('lock.gymPhoto')} onPress={photo} />
          <HoldAction
            kind="coupon"
            variant="button"
            idleLabel={restLeft > 0 ? t('lock.restCoupon', { n: restLeft }) : t('lock.restNone')}
            disabled={restLeft <= 0}
            onConfirm={() => spendRestCoupon()}
          />
        </>
      }
    >
      <LockTitle>{title}</LockTitle>
      <LockDesc>{desc}</LockDesc>
    </LockFrame>
  );
}
