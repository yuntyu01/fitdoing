import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  HOLD_IDLE,
  holdCancel,
  holdConfirm,
  holdRemainingSec,
  holdStart,
  holdTick,
  type HoldKind,
} from '../../../domain/lock';
import { FullButton } from '../../../ui/FullButton';
import { useTicker } from '../useTicker';

/**
 * 비상 해제·휴식권처럼 5초 기다려야 하는 해제.
 * start() -> 5초 카운트 -> 지나면 [지금 해제하기] -> 확정. 중간에 취소할 수 있다.
 * 대기 중에는 화면이 하단 버튼 자리를 HoldConfirm으로 바꿔 보여 준다.
 */
export function useHold(kind: HoldKind, onConfirm: () => void) {
  const [raw, setRaw] = useState(HOLD_IDLE);
  const now = useTicker(250);
  const hold = holdTick(raw, now);
  return {
    kind,
    active: hold.phase !== 'idle',
    ready: hold.phase === 'ready',
    wait: Math.min(5, holdRemainingSec(hold, now)),
    start: () => setRaw(holdStart(kind, Date.now())),
    cancel: () => setRaw(holdCancel()),
    confirm: () => {
      const r = holdConfirm(hold, Date.now());
      setRaw(r.state);
      if (r.confirmed) onConfirm();
    },
  };
}

export type Hold = ReturnType<typeof useHold>;

/** 대기 중 하단: [취소] [n초 뒤에 풀 수 있어요 → 지금 해제하기] */
export function HoldConfirm({ hold }: { hold: Hold }) {
  const { t } = useTranslation();
  const label = hold.ready
    ? t(hold.kind === 'coupon' ? 'lock.couponConfirm' : 'lock.emergencyConfirm')
    : t('lock.holdWait', { s: hold.wait });
  return (
    <View style={styles.row}>
      <View style={styles.cancel}>
        <FullButton variant="secondary" label={t('lock.cancel')} onPress={hold.cancel} />
      </View>
      <View style={styles.confirm}>
        <FullButton label={label} onPress={hold.confirm} disabled={!hold.ready} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  cancel: { flex: 1 },
  confirm: { flex: 2 },
});
