import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatCountdown } from '../../domain/lock';
import { ContactRow, LockFrame, LockRows, LockTimer } from '../../features/lock/components/LockFrame';
import { useLockOfType } from '../../features/lock/useLockOfType';
import { useSettings } from '../../features/settings/store';
import { hhmm } from '../../features/today/format';
import { usePalette } from '../../ui/theme';

// 취침 잠금은 기상 시각에만 풀린다(비상 해제·쿠폰 없음). 설정 화면으로도 나갈 수 없어 일정 수정 줄은 두지 않는다.
export default function SleepLock() {
  const { t } = useTranslation();
  const c = usePalette();
  const { lock, now } = useLockOfType('sleep');
  const sleep = useSettings((s) => s.settings?.sleep);
  if (!lock) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  return (
    <LockFrame
      label={t('lock.typeSleep')}
      title={t('lock.sleepNow')}
      desc={t('lock.sleepDesc')}
      footer={<ContactRow kinds={['call', 'alarm']} />}
    >
      <LockTimer
        caption={t('lock.timerWake')}
        value={formatCountdown(lock.until - now)}
        note={t('lock.releaseAt', { time: hhmm(new Date(lock.until)) })}
      />
      {sleep ? (
        <LockRows
          items={[
            { label: t('lock.bedTime'), value: sleep.bedTime },
            { label: t('lock.wakeTime'), value: sleep.wakeTime },
          ]}
        />
      ) : null}
    </LockFrame>
  );
}
