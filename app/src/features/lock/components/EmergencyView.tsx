import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { releaseMethods, type ActiveLock } from '../../../domain/lock';
import { FullButton } from '../../../ui/FullButton';
import { SubHeader } from '../../../ui/Headers';
import { Screen } from '../../../ui/Screen';
import { useThemedStyles, type Palette } from '../../../ui/theme';
import { text } from '../../../ui/tokens';
import { FormSection, TextField } from '../../settings/editors/Form';
import { useSettings } from '../../settings/store';
import { EMERGENCY_REASON_MAX, emergencyRelease } from '../actions';
import { useLock } from '../store';
import { HoldConfirm, useHold } from './HoldAction';
import { LockRows, useBlockBack } from './LockFrame';

function lockName(t: TFunction, lock: ActiveLock): string {
  switch (lock.type) {
    case 'meal':
      return lock.meal ? t('emergency.lockMeal', { n: lock.meal }) : t('emergency.lockMealUnknown');
    case 'gym':
      return t('emergency.lockGym');
    case 'sleep':
      return t('emergency.lockSleep');
  }
}

/**
 * 비상 해제 확인 화면. 잠금 화면 안(끼니)과 /emergency 경로가 함께 쓴다.
 * 해제는 기존과 같이 5초 대기 뒤 확정하고, 주간 남은 횟수가 없으면 누를 수 없다.
 * 사유는 선택이다. 적으면 이번에 닫는 잠금 기록(lock_events.reason)에 남고 서버로 동기화된다.
 * 걸린 잠금이 없으면 빈 상태를 보여 준다.
 */
export function EmergencyView({ lock, onClose }: { lock: ActiveLock | null; onClose: () => void }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const left = useLock((s) => s.emergencyLeft);
  const total = useSettings((s) => s.settings?.emergencyPerWeek ?? 0);
  const mode = useSettings((s) => s.settings?.mode ?? 'normal');
  const allowed = !!lock && releaseMethods(lock.type, mode).includes('emergency');
  const [reason, setReason] = useState('');
  const hold = useHold('emergency', () => {
    if (lock) emergencyRelease(lock.type, new Date(), reason);
  });
  useBlockBack(hold.active ? hold.cancel : onClose);

  const note = !lock ? null : !allowed ? t('emergency.notAllowed') : left <= 0 ? t('emergency.noneLeft') : null;
  const rows = [
    ...(lock ? [{ label: t('emergency.current'), value: lockName(t, lock) }] : []),
    { label: t('emergency.left'), value: t('emergency.leftValue', { left, total }) },
  ];

  return (
    <Screen
      header={<SubHeader title={t('emergency.title')} onBack={hold.active ? hold.cancel : onClose} />}
      title={lock ? t('emergency.question') : t('emergency.emptyTitle')}
      desc={lock ? t('emergency.desc') : t('emergency.emptyDesc')}
      footer={
        !lock ? (
          <FullButton label={t('emergency.close')} onPress={onClose} />
        ) : hold.active ? (
          <HoldConfirm hold={hold} />
        ) : (
          <>
            <FullButton label={t('emergency.release')} onPress={hold.start} disabled={!allowed || left <= 0} />
            <FullButton variant="text" label={t('common.cancel')} onPress={onClose} />
          </>
        )
      }
    >
      <View style={styles.group}>
        <LockRows items={rows} outer={false} />
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      {/* 풀 수 있는 잠금일 때만 사유 칸을 둔다 */}
      {lock && allowed && left > 0 ? (
        <FormSection title={t('emergency.reasonTitle')} note={t('emergency.reasonNote')}>
          <TextField
            multiline
            value={reason}
            onChange={setReason}
            placeholder={t('emergency.reasonPlaceholder')}
            maxLength={EMERGENCY_REASON_MAX}
            accessibilityLabel={t('emergency.reasonTitle')}
          />
        </FormSection>
      ) : null}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    group: { gap: 12 },
    note: { ...text.caption, color: c.sub },
  });
