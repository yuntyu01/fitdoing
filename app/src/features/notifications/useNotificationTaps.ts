import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { notificationRoute } from '../../domain/notifications';

/**
 * 알림을 누르면 할 일이 있는 화면으로 간다 (끼니는 촬영, 헬스는 헬스 상세). 앱이 꺼져 있다가 알림으로 켜져도 같다.
 * ready: 루트 Stack 을 그렸고 로그인·온보딩을 마쳐 그 화면들이 열려 있을 때.
 */
export function useNotificationTaps(ready: boolean) {
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!ready || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const href = notificationRoute(response.notification.request.content.data?.kind);
    // 다음에 앱을 켤 때 같은 알림으로 다시 이동하지 않게 지운다
    Notifications.clearLastNotificationResponse();
    if (href) router.push(href as Href);
  }, [ready, response]);
}
