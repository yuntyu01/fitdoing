import { router } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, size } from '../../../ui/tokens';

/** 오른쪽 아래 카메라 버튼. 마감 10분 이하면 바깥 테두리로 강조. 누르면 촬영 화면으로 간다. */
export function CameraFab({ urgent, onPress }: { urgent: boolean; onPress?: () => void }) {
  return (
    <View style={[styles.ring, urgent && styles.ringOn]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="camera"
        onPress={onPress ?? (() => router.push('/capture'))}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Camera size={24} color={colors.onAccent} strokeWidth={1.8} />
      </Pressable>
    </View>
  );
}

const RING = 4;

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    padding: RING,
    borderRadius: (size.fab + RING * 4) / 2,
    borderWidth: RING,
    borderColor: 'transparent',
  },
  ringOn: { borderColor: colors.accent, backgroundColor: colors.card },
  fab: {
    width: size.fab,
    height: size.fab,
    borderRadius: size.fab / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
