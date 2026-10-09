import * as Notifications from 'expo-notifications';
import { usePathname, useRootNavigationState, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSession } from '../auth/session';
import { useSettings } from '../settings/store';
import { onMealLogged } from '../meals/hooks';
import { releaseGymLock, releaseMealLock } from './actions';
import { getLockEngine } from './engine';
import { useLock } from './store';

// 잠금 화면에서 촬영 화면으로 갔다 올 수 있어야 하니, 이 경로에서는 잠금 화면으로 끌어오지 않는다.
const FREE_PATHS = ['/capture'];
const POLL_MS = 20_000;

/**
 * 루트 레이아웃에서 한 번 부른다.
 * - 설정이 바뀌면 엔진에 일정을 다시 넘기고 판정한다.
 * - 앱 시작·포그라운드 복귀·알림 탭·20초마다·엔진 이벤트 때 판정한다.
 * - 잠금이 걸려 있으면 잠금 화면으로, 풀렸으면 잠금 화면에서 나간다.
 */
export function useLockController() {
  const router = useRouter();
  const pathname = usePathname();
  const navReady = !!useRootNavigationState()?.key;
  const settings = useSettings((s) => s.settings);
  const active = useLock((s) => s.active);
  const loggedIn = useSession((s) => s.status === 'in');
  const hasSettings = settings !== null;

  useEffect(() => {
    if (!settings) return;
    getLockEngine()
      .setSchedule(settings)
      .catch(() => {});
    useLock.getState().refresh();
  }, [settings]);

  useEffect(() => {
    if (!hasSettings) return;
    const run = () => {
      useLock.getState().refresh();
    };
    const appSub = AppState.addEventListener('change', (s) => s === 'active' && run());
    const notifSub = Notifications.addNotificationResponseReceivedListener(run);
    const engine = getLockEngine();
    const startedSub = engine.onLockStarted(run);
    const releasedSub = engine.onLockReleased((e) => {
      // 엔진이 지오펜스 진입으로 헬스 잠금을 풀었다면 도착 기록을 남겨야 JS 판정이 다시 걸지 않는다.
      if (e.type === 'gym' && e.releasedBy === 'action' && useLock.getState().active?.type === 'gym') {
        releaseGymLock('geofence');
      } else {
        run();
      }
    });
    const mealSub = onMealLogged((e) => {
      // 촬영 쪽이 기록을 저장하면 끼니 잠금을 풀고, 앱이 꺼져 있어도 이 끼니가 잠기지 않게 엔진에 알린다.
      engine.markDone('meal', e.date, e.index).catch(() => {});
      releaseMealLock();
    });
    const timer = setInterval(run, POLL_MS);
    return () => {
      mealSub();
      appSub.remove();
      notifSub.remove();
      startedSub.remove();
      releasedSub.remove();
      clearInterval(timer);
    };
  }, [hasSettings]);

  useEffect(() => {
    if (!navReady || !hasSettings || !loggedIn) return; // 로그아웃 상태에서는 잠금 화면 경로가 막혀 있다
    const onLock = pathname.startsWith('/lock');
    if (active) {
      const target = `/lock/${active.type}`;
      if (pathname === target || FREE_PATHS.some((p) => pathname.startsWith(p))) return;
      if (onLock) router.replace(target as Href);
      else router.push(target as Href);
    } else if (onLock) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  }, [active, pathname, navReady, hasSettings, loggedIn, router]);
}
