import { Stack } from 'expo-router';

import { usePalette } from '../../ui/theme';

// 잠금 화면: 테마 배경, 제스처로 닫기 없음.
export default function LockLayout() {
  const c = usePalette();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: 'fade',
        contentStyle: { backgroundColor: c.bg },
      }}
    />
  );
}
