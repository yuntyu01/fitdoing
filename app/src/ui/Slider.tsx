import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { useThemedStyles, type Palette } from './theme';

interface Props {
  value: number; // 0~1
  label: string; // 접근성 이름
  onChange: (v: number) => void; // 끄는 동안
  onEnd?: (v: number) => void; // 손을 뗐을 때
}

/** 가로 슬라이더. 끄는 동안 onChange, 손을 떼면 onEnd. */
export function Slider({ value, label, onChange, onEnd }: Props) {
  const styles = useThemedStyles(makeStyles);
  const width = useRef(1);
  const startX = useRef(0);
  const last = useRef(value);
  // 끄는 동안 부르는 함수는 늘 최신 것으로 (처음 그릴 때 붙잡은 옛 값으로 되돌리지 않게)
  const onChangeRef = useRef(onChange);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onChangeRef.current = onChange;
    onEndRef.current = onEnd;
  });
  // 만드는 함수 안의 ref 는 끌 때(이벤트) 읽는다. 그리는 중에 읽지 않는다.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const set = (x: number) => {
      last.current = Math.max(0, Math.min(1, x / width.current));
      onChangeRef.current(last.current);
    };
    const end = () => onEndRef.current?.(last.current);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        set(startX.current);
      },
      onPanResponderMove: (_e, g) => set(startX.current + g.dx),
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  });
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const v = Math.max(0, Math.min(1, value + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)));
        onChange(v);
        onEnd?.(v);
      }}
      onLayout={(e) => (width.current = e.nativeEvent.layout.width || 1)}
      style={styles.slider}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.fill, { width: `${value * 100}%` }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: `${value * 100}%` }]} />
    </View>
  );
}

const THUMB = 22;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    slider: { height: 36, justifyContent: 'center' },
    track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: c.track },
    fill: { height: '100%', borderRadius: 2, backgroundColor: c.bar },
    thumb: {
      position: 'absolute',
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      marginLeft: -THUMB / 2,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: c.scheme === 'dark' ? '#FFFFFF' : c.border,
    },
  });
