import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  HOLD_IDLE,
  holdCancel,
  holdConfirm,
  holdRemainingSec,
  holdStart,
  holdTick,
  type HoldKind,
} from '../../../domain/lock';
import { colors, fonts, radius, size, space } from '../../../ui/tokens';
import { useTicker } from '../useTicker';
import { LOCK_CARD, LockButton } from './LockFrame';

interface Props {
  kind: HoldKind;
  variant: 'link' | 'button';
  idleLabel: string;
  disabled?: boolean;
  /** 5초를 기다린 뒤 확정했을 때 */
  onConfirm: () => void;
}

/**
 * 비상 해제·휴식권처럼 5초 기다려야 하는 해제 버튼.
 * 누르면 5초 카운트 -> 지나면 [지금 해제하기] -> 확정. 중간에 취소할 수 있다.
 */
export function HoldAction({ kind, variant, idleLabel, disabled, onConfirm }: Props) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState(HOLD_IDLE);
  const now = useTicker(250);
  const hold = holdTick(raw, now);
  const wait = Math.min(5, holdRemainingSec(hold, now));

  const confirm = () => {
    const r = holdConfirm(hold, Date.now());
    setRaw(r.state);
    if (r.confirmed) onConfirm();
  };

  if (hold.phase === 'idle') {
    return variant === 'button' ? (
      <LockButton variant="secondary" label={idleLabel} disabled={disabled} onPress={() => setRaw(holdStart(kind, Date.now()))} />
    ) : (
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={8}
        onPress={() => setRaw(holdStart(kind, Date.now()))}
        style={[styles.link, disabled && { opacity: 0.4 }]}
      >
        <Text style={styles.linkText}>{idleLabel}</Text>
      </Pressable>
    );
  }

  const ready = hold.phase === 'ready';
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={() => setRaw(holdCancel())} style={styles.cancel}>
        <Text style={styles.cancelText}>{t('lock.cancel')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={!ready}
        onPress={confirm}
        style={[styles.confirm, !ready && { opacity: 0.45 }]}
      >
        <Text style={styles.confirmText}>
          {ready ? t(kind === 'coupon' ? 'lock.couponConfirm' : 'lock.emergencyConfirm') : t('lock.holdWait', { s: wait })}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'center', paddingVertical: space.s, paddingHorizontal: space.m },
  linkText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.lockSub },
  row: { flexDirection: 'row', gap: space.s },
  cancel: {
    flex: 1,
    height: size.button,
    borderRadius: radius.button,
    backgroundColor: LOCK_CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontFamily: fonts.semibold, fontSize: 17, color: colors.lockText },
  confirm: {
    flex: 2,
    height: size.button,
    borderRadius: radius.button,
    backgroundColor: colors.lockText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text, fontVariant: ['tabular-nums'] },
});
