import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

import { unfriend } from './data';

/** 친구 끊기 확인 → 끊기(remove, 기본은 서버에 바로). 끊었으면 done(). 실패하면 안내만 한다. */
export function askUnfriend(
  t: TFunction,
  friend: { id: string; name: string },
  done: () => void,
  remove: (id: string) => Promise<boolean> = unfriend,
) {
  Alert.alert(t('friends.removeTitle', { name: friend.name }), t('friends.removeBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('friends.remove'),
      style: 'destructive',
      onPress: () => {
        void remove(friend.id).then((ok) => {
          if (ok) done();
          else Alert.alert(t('friends.error.offline'));
        });
      },
    },
  ]);
}

/** 게시물·친구의 하루의 더 보기 메뉴: 하루 기록 보기(있으면) · 친구 끊기 */
export function friendMenu(
  t: TFunction,
  friend: { id: string; name: string },
  opts: { onSeeDay?: () => void; onRemoved: () => void },
) {
  Alert.alert(friend.name, undefined, [
    ...(opts.onSeeDay ? [{ text: t('friends.seeDay'), onPress: opts.onSeeDay }] : []),
    { text: t('friends.remove'), style: 'destructive' as const, onPress: () => askUnfriend(t, friend, opts.onRemoved) },
    { text: t('common.cancel'), style: 'cancel' as const },
  ]);
}
