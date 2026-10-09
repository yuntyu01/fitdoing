import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatCountdown } from '../../domain/lock';
import { EmergencyView } from '../../features/lock/components/EmergencyView';
import { clearEmergencyIntent, useEmergencyIntent } from '../../features/lock/components/emergencyIntent';
import { ContactRow, LockFrame, LockStats, LockTimer, TextActions } from '../../features/lock/components/LockFrame';
import { useLock } from '../../features/lock/store';
import { useLockOfType } from '../../features/lock/useLockOfType';
import { hhmm } from '../../features/today/format';
import { FullButton } from '../../ui/FullButton';
import { usePalette } from '../../ui/theme';

export default function MealLock() {
  const { t } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const { lock, now } = useLockOfType('meal');
  const left = useLock((s) => s.emergencyLeft);
  // 비상 해제는 경로를 바꾸지 않고 이 화면 안에서 연다 (잠금 중에는 다른 경로로 나갈 수 없다).
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const fromNative = useEmergencyIntent((s) => s.pending);
  useEffect(() => clearEmergencyIntent, []);
  if (!lock) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const closeEmergency = () => {
    clearEmergencyIntent();
    setEmergencyOpen(false);
  };
  if (emergencyOpen || fromNative) return <EmergencyView lock={lock} onClose={closeEmergency} />;

  const capture = () => {
    try {
      router.push('/capture' as Href); // 촬영 화면이 아직 없어도 크래시하지 않는다
    } catch {}
  };

  return (
    <LockFrame
      label={t('lock.typeMeal')}
      title={lock.meal ? t('lock.mealDeadline', { n: lock.meal }) : t('lock.mealDeadlineUnknown')}
      desc={t('lock.mealDesc')}
      footer={
        <>
          <ContactRow kinds={['call', 'sms', 'map', 'kakao']} />
          <FullButton label={t('lock.recordMeal')} onPress={capture} />
          <TextActions
            items={[
              {
                label: left > 0 ? t('lock.emergency', { n: left }) : t('lock.emergencyNone'),
                disabled: left <= 0,
                onPress: () => setEmergencyOpen(true),
              },
            ]}
          />
        </>
      }
    >
      <LockTimer
        caption={t('lock.timerLeft')}
        value={formatCountdown(lock.until - now)}
        note={t('lock.releaseAt', { time: hhmm(new Date(lock.until)) })}
      />
      <LockStats
        items={[
          // 끼니 잠금은 마감 시각에 시작한다.
          { label: t('lock.statDeadline'), value: hhmm(new Date(lock.startedAt)) },
          { label: t('lock.statRecord'), value: t('lock.notRecorded') },
        ]}
      />
    </LockFrame>
  );
}
