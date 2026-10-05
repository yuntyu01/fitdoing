import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatCountdown } from '../../domain/lock';
import { BigTimer, ContactRow, LockDesc, LockFrame, LockTitle } from '../../features/lock/components/LockFrame';
import { useLockOfType } from '../../features/lock/useLockOfType';
import { useSettings } from '../../features/settings/store';
import { colors } from '../../ui/tokens';

export default function SleepLock() {
  const { t } = useTranslation();
  const { lock, now } = useLockOfType('sleep');
  const wake = useSettings((s) => s.settings?.sleep.wakeTime ?? '');
  if (!lock) return <View style={{ flex: 1, backgroundColor: colors.lockBg }} />;

  return (
    <LockFrame footer={<ContactRow kinds={['call', 'alarm']} />}>
      <LockTitle>{t('lock.sleepTitle', { time: wake })}</LockTitle>
      <LockDesc>{t('lock.sleepDesc')}</LockDesc>
      <BigTimer value={formatCountdown(lock.until - now)} />
    </LockFrame>
  );
}
