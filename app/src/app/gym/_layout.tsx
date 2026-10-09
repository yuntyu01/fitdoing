import { Stack } from 'expo-router';

import { usePalette } from '../../ui/theme';

// gym/verify (사진 인증) 같은 하위 화면이 여기에 붙는다.
export default function GymLayout() {
  const c = usePalette();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />;
}
