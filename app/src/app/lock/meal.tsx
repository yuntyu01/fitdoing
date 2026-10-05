import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatCountdown } from '../../domain/lock';
import { emergencyRelease } from '../../features/lock/actions';
import { BigTimer, ContactRow, LockButton, LockDesc, LockFrame, LockTitle } from '../../features/lock/components/LockFrame';
import { HoldAction } from '../../features/lock/components/HoldAction';
import { useLock } from '../../features/lock/store';
import { useLockOfType } from '../../features/lock/useLockOfType';
import { colors } from '../../ui/tokens';

export default function MealLock() {
  const { t } = useTranslation();
  const router = useRouter();
  const { lock, now } = useLockOfType('meal');
  const left = useLock((s) => s.emergencyLeft);
  if (!lock) return <View style={{ flex: 1, backgroundColor: colors.lockBg }} />;

  const capture = () => {
    try {
      router.push('/capture' as Href); // 촬영 화면이 아직 없어도 크래시하지 않는다
    } catch {}
  };

  return (
    <LockFrame
      footer={
        <>
          <ContactRow kinds={['call', 'sms', 'map', 'kakao']} />
          <LockButton label={t('lock.captureNow')} onPress={capture} />
          <HoldAction
            kind="emergency"
            variant="link"
            idleLabel={left > 0 ? t('lock.emergency', { n: left }) : t('lock.emergencyNone')}
            disabled={left <= 0}
            onConfirm={() => emergencyRelease('meal')}
          />
        </>
      }
    >
      <LockTitle>
        {lock.meal ? t('lock.mealTitle', { n: lock.meal }) : t('lock.mealTitleUnknown')}
      </LockTitle>
      <LockDesc>{t('lock.mealDesc')}</LockDesc>
      <BigTimer value={formatCountdown(lock.until - now)} />
      <LockDesc>{t('lock.remaining')}</LockDesc>
    </LockFrame>
  );
}
