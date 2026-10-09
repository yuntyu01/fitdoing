import { Alert, Linking } from 'react-native';

import i18n from '../../i18n';
import { requestNotificationPermission } from '../notifications/schedule';

/**
 * 마감 알림을 켤 때 부른다. 권한이 없으면 온보딩과 같은 방식으로 묻는다.
 * 끝내 허용하지 않으면 휴대폰 설정으로 안내하고 false. (권한 없이 켜 두면 알림이 오지 않는데 켜진 것처럼 보이니까)
 */
export async function askToEnableNotifications(): Promise<boolean> {
  const ok = await requestNotificationPermission().catch(() => false);
  if (!ok) {
    Alert.alert(i18n.t('settings.notifDeniedTitle'), i18n.t('settings.notifDeniedBody'), [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      { text: i18n.t('settings.openSystemSettings'), onPress: () => void Linking.openSettings().catch(() => {}) },
    ]);
  }
  return ok;
}
