import { router } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { layout, size } from '../../../ui/tokens';

const RING_GAP = 4; // 마감 임박 링과 버튼 사이

/**
 * 오른쪽 아래에 내용 위로 떠 있는 카메라 버튼 (56, 진행 막대 색으로 채우고 아이콘은 배경색). 그림자 없음.
 * 마감 10분 이하면 바깥에 얇은 링을 둘러 강조한다(버튼 위치는 그대로). 누르면 촬영 화면으로 간다.
 */
export function CameraFab({ urgent, bottom = 0, onPress }: { urgent: boolean; bottom?: number; onPress?: () => void }) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      style={[styles.ring, { bottom: bottom + layout.fabGap - RING_GAP }, urgent && styles.ringOn]}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="camera"
        onPress={onPress ?? (() => router.push('/capture'))}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <Camera size={24} color={c.bg} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

/** 스크롤 끝에서 마지막 내용이 버튼에 가리지 않게 더할 여백 (탭바 위 공간에 더한다) */
export const FAB_CLEARANCE = size.fab + layout.fabGap * 2;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    ring: {
      position: 'absolute',
      right: layout.screen - RING_GAP,
      padding: RING_GAP - layout.hairline,
      borderRadius: size.fab / 2 + RING_GAP,
      borderWidth: layout.hairline,
      borderColor: 'transparent',
    },
    ringOn: { borderColor: c.bar },
    fab: {
      width: size.fab,
      height: size.fab,
      borderRadius: size.fab / 2,
      backgroundColor: c.bar,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.85 },
  });
