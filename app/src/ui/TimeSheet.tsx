import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { fromMinutes, toMinutes } from '../domain/time';
import { BottomSheet } from './BottomSheet';
import { FullButton } from './FullButton';
import { useThemedStyles, type Palette } from './theme';
import { fonts, radius } from './tokens';

const ITEM = 44;
const VISIBLE = 5;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

interface Props {
  visible: boolean;
  title?: string;
  value: string; // 'HH:mm'
  onClose: () => void;
  onConfirm: (v: string) => void;
}

/** 시·분(5분 단위) 휠을 담은 바텀시트 */
export function TimeSheet({ visible, title, value, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [h, setH] = useState(0);
  const [m, setM] = useState(0);

  // 열릴 때(또는 열린 채로 값이 바뀔 때) 휠을 값에 맞춘다
  const syncKey = visible ? value : null;
  const [seen, setSeen] = useState<string | null>(null);
  if (seen !== syncKey) {
    setSeen(syncKey);
    if (syncKey !== null) {
      const min = toMinutes(syncKey);
      setH(Math.floor(min / 60));
      setM((Math.round((min % 60) / 5) * 5) % 60);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title ?? t('timeSheet.title')}>
      <View style={styles.wheels}>
        <View pointerEvents="none" style={styles.band} />
        <Wheel items={HOURS} value={h} onChange={setH} visible={visible} styles={styles} />
        <Text style={styles.colon}>:</Text>
        <Wheel items={MINUTES} value={m} onChange={setM} visible={visible} styles={styles} />
      </View>
      <FullButton label={t('common.done')} onPress={() => onConfirm(fromMinutes(h * 60 + m))} />
    </BottomSheet>
  );
}

function Wheel({
  items,
  value,
  onChange,
  visible,
  styles,
}: {
  items: number[];
  value: number;
  onChange: (v: number) => void;
  visible: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  const ref = useRef<ScrollView>(null);
  const idx = Math.max(0, items.indexOf(value));

  // 열릴 때 현재 값으로 굴려 둔다.
  useEffect(() => {
    if (visible) requestAnimationFrame(() => ref.current?.scrollTo({ y: idx * ITEM, animated: false }));
    // value가 바뀔 때마다 굴리면 스크롤과 싸우므로 열릴 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.min(items.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ITEM)));
    onChange(items[i]);
  };

  return (
    <ScrollView
      ref={ref}
      style={styles.wheel}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM}
      decelerationRate="fast"
      contentContainerStyle={{ paddingVertical: ITEM * Math.floor(VISIBLE / 2) }}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
    >
      {items.map((v) => (
        <View key={v} style={styles.item}>
          <Text style={[styles.itemText, v === value && styles.itemOn]}>{String(v).padStart(2, '0')}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wheels: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: ITEM * VISIBLE,
      marginBottom: 24,
    },
    band: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: ITEM * Math.floor(VISIBLE / 2),
      height: ITEM,
      borderRadius: radius.field,
      backgroundColor: c.selected,
    },
    wheel: { width: 88, height: ITEM * VISIBLE, flexGrow: 0 },
    item: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
    itemText: { fontFamily: fonts.medium, fontSize: 22, color: c.faint, fontVariant: ['tabular-nums'] },
    itemOn: { color: c.text, fontFamily: fonts.bold },
    colon: { fontFamily: fonts.bold, fontSize: 22, color: c.text, marginHorizontal: 8 },
  });
