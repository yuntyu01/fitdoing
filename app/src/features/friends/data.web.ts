// 웹(스크린샷 전용) 친구 데이터: 서버 대신 sample.ts 예시를 돌려준다. 내보내는 이름·모양은 data.ts와 같다(아래 타입 검사).
// 웹은 로그인·서버 없이 화면만 찍기 때문에, 응원·댓글·친구 추가는 화면 안에서만 바뀐다.
import { useCallback, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

import type * as Native from './data';
import { sampleCode, sampleComments, sampleDay, sampleFeed, sampleFriends } from './sample';
import { buildTimeline, patchPost, usePatched, type FriendError } from './state';
import type { FriendComment, FriendPost, FriendSummary } from './types';

export { buildTimeline, type FriendError };

const noop = async () => {};

export function toFriendError(): FriendError {
  return 'offline';
}

export function useFriendFeed(): Native.FriendFeed {
  const [now] = useState(() => new Date()); // 예시 시각을 화면이 열린 시점에 고정
  const [posts] = useState(() => sampleFeed(now));
  return {
    posts,
    hasFriends: true,
    loading: false,
    refreshing: false,
    loadingMore: false,
    error: null,
    refresh: noop,
    loadMore: () => {},
  };
}

export function useFriendDay(id: string | undefined): Native.FriendDayState {
  const [day] = useState(() => (id ? sampleDay(id, new Date()) : null));
  return { day, loading: false, refreshing: false, error: day ? null : 'notFound', refresh: noop };
}

export function useFriendList(): Native.FriendListState {
  const [friends, setFriends] = useState<FriendSummary[]>(sampleFriends);
  const remove = useCallback(async (id: string) => {
    setFriends((l) => l.filter((f) => f.id !== id));
    return true;
  }, []);
  return { friends, loading: false, error: null, refresh: noop, add: async () => 'codeNotFound', remove };
}

export async function unfriend(): Promise<boolean> {
  return true;
}

export function useFriendCode(): Native.FriendCodeState {
  return { code: sampleCode, loading: false, error: null, refresh: noop };
}

export function useCheer(post: FriendPost) {
  const p = usePatched(post);
  const toggle = useCallback(
    () => patchPost(p.id, { cheered: !p.cheered, cheers: Math.max(0, p.cheers + (p.cheered ? -1 : 1)) }),
    [p.id, p.cheers, p.cheered],
  );
  return { cheered: p.cheered, count: p.cheers, comments: p.comments, toggle };
}

export function useComments(postId: string | undefined): Native.CommentsState {
  const [comments, setComments] = useState<FriendComment[]>(() => sampleComments(postId ?? 'sample', new Date()));
  const send = useCallback(
    async (body: string) => {
      const c: FriendComment = {
        id: `local-${Date.now()}`,
        postId: postId ?? 'sample',
        authorId: 'me',
        name: '나',
        body,
        createdAt: new Date().toISOString(),
        mine: true,
      };
      setComments((l) => [...l, c]);
      return true;
    },
    [postId],
  );
  const remove = useCallback(async (id: string) => {
    setComments((l) => l.filter((c) => c.id !== id));
    return true;
  }, []);
  return { comments, loading: false, error: null, refresh: noop, send, remove };
}

export function usePhotoSource(): ImageSourcePropType | null {
  return null;
}

// data.ts와 내보내는 모양이 어긋나면 여기서 타입 오류가 난다.
const sameShape: typeof Native = {
  toFriendError,
  buildTimeline,
  useFriendFeed,
  useFriendDay,
  useFriendList,
  unfriend,
  useFriendCode,
  useCheer,
  useComments,
  usePhotoSource,
};
void sameShape;
