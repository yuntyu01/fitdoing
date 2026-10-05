import { Stack } from 'expo-router';

import { colors } from '../../ui/tokens';

// 잠금 화면: 검정 바탕, 제스처로 닫기 없음.
export default function LockLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.lockBg },
      }}
    />
  );
}
