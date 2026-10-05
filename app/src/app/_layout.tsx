import '../i18n';

import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Text } from 'react-native';

import { db } from '../db/client';
import migrations from '../db/migrations/migrations';
import { flushQueue } from '../features/api/client';
import { startSync } from '../features/api/track';
import { useLockController } from '../features/lock/controller';
import { rescheduleNotifications, setupNotifications } from '../features/notifications/schedule';
import { useSettings } from '../features/settings/store';
import { colors, fonts } from '../ui/tokens';

SplashScreen.preventAutoHideAsync();
setupNotifications().catch((e) => console.warn('notification setup failed', e));

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.regular]: require('../../assets/fonts/Pretendard-Regular.otf'),
    [fonts.medium]: require('../../assets/fonts/Pretendard-Medium.otf'),
    [fonts.semibold]: require('../../assets/fonts/Pretendard-SemiBold.otf'),
    [fonts.bold]: require('../../assets/fonts/Pretendard-Bold.otf'),
  });
  const { success: migrated, error: migrationError } = useMigrations(db, migrations);
  const { settings, loaded, load } = useSettings();
  useLockController(); // 잠금 판정·잠금 화면 이동

  useEffect(() => {
    if (!migrated) return;
    load();
    const cur = useSettings.getState().settings;
    if (cur) rescheduleNotifications(cur).catch((e) => console.warn('reschedule failed', e));
  }, [migrated, load]);

  // 설정이 생기면(앱 시작 또는 온보딩 직후) 초기 전체 동기화 + 큐 비우기. 서버가 죽어 있어도 화면은 막지 않는다.
  const hasSettings = settings !== null;
  useEffect(() => {
    if (migrated && hasSettings) void startSync();
  }, [migrated, hasSettings]);

  // 앱이 앞으로 올 때마다 7일치 알림 창을 앞으로 민다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const cur = useSettings.getState().settings;
      if (s === 'active' && cur) rescheduleNotifications(cur).catch(() => {});
      if (s === 'active') flushQueue(true).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  const ready = (fontsLoaded || fontError) && loaded;

  useEffect(() => {
    if (ready || migrationError) SplashScreen.hideAsync();
  }, [ready, migrationError]);

  if (migrationError) {
    return <Text style={{ padding: 40 }}>DB error: {migrationError.message}</Text>;
  }
  if (!ready) return null;

  const onboarded = settings !== null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="edit" />
          <Stack.Screen name="lock" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="capture" options={{ animation: 'slide_from_bottom' }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
