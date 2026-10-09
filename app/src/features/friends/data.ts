// 친구 데이터 접근 층 (네이티브: 서버 /api/friends/*). 화면은 여기 훅만 쓴다.
// 웹 스크린샷 빌드는 같은 이름을 내보내는 data.web.ts(예시 데이터)를 쓴다. 둘의 모양은 data.web.ts가 타입으로 맞춘다.
// 친구 기록은 서버에만 있어서, 서버가 꺼져 있으면 오류 상태(안내 + 다시 시도)를 돌려줄 뿐 앱은 멈추지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

import {
  addComment,
  addFriend,
  ApiError,
  deleteComment,
  fetchComments,
  fetchFriendCode,
  fetchFriendDay,
  fetchFriendFeed,
  fetchFriends,
  friendPhotoSource,
  removeFriend,
  setCheer,
} from '../api/client';
import { useSession } from '../auth/session';
import { bumpFriends, clearPatches, patchPost, useFriendsVersion, usePatched, type FriendError } from './state';
import type { FriendComment, FriendDay, FriendPost, FriendSummary } from './types';

export { buildTimeline, type FriendError } from './state';

const PAGE = 20;

/** 서버 오류를 화면이 고를 안내 종류로 바꾼다 */
export function toFriendError(e: unknown): FriendError {
  if (!(e instanceof ApiError)) return 'offline'; // 네트워크·시간 초과
  let code = '';
  try {
    code = (JSON.parse(e.message) as { code?: string }).code ?? '';
  } catch {
    // 본문이 JSON이 아니면 상태 코드만 본다
  }
  if (code === 'FRIEND_CODE_NOT_FOUND') return 'codeNotFound';
  if (code === 'CANNOT_ADD_SELF') return 'self';
  if (e.status === 404) return 'notFound';
  if (e.status === 400) return 'invalid';
  return 'server';
}

interface Loaded<T> {
  data: T | null;
  loading: boolean; // 처음 불러오는 중 (데이터 없음)
  refreshing: boolean; // 당겨서 새로고침 중
  error: FriendError | null;
  refresh: () => Promise<void>;
  reload: () => Promise<void>; // 당기기 표시 없이 다시
  setData: (fn: (prev: T | null) => T | null) => void;
}

/**
 * key가 바뀔 때(처음 포함) 불러오고, refresh(당기기)·reload(조용히)로 다시 부르는 단순한 훅. 늦게 온 옛 응답은 버린다.
 * key가 null이면(대상 없음) 부르지 않는다.
 */
function useLoad<T>(key: string | null, load: () => Promise<T>, onData?: (d: T) => void): Loaded<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(key !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<FriendError | null>(null);
  const seq = useRef(0);
  const loadRef = useRef(load);
  const onDataRef = useRef(onData);
  useEffect(() => {
    loadRef.current = load;
    onDataRef.current = onData;
  });

  // 상태는 응답이 온 뒤에만 바꾼다 (effect 안에서 바로 setState 하지 않게). 처음엔 loading이 이미 true다.
  const run = useCallback(async () => {
    const fn = loadRef.current;
    const n = ++seq.current;
    try {
      const d = await fn();
      if (n !== seq.current) return;
      onDataRef.current?.(d);
      setDataState(d);
      setError(null);
    } catch (e) {
      if (n !== seq.current) return;
      setError(toFriendError(e));
    } finally {
      if (n === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (key !== null) void run();
  }, [key, run]);

  // 당겨서 새로고침: 표시를 켜고 다시. reload: 표시 없이 다시.
  const refresh = useCallback(async () => {
    if (key === null) return;
    setRefreshing(true);
    await run();
  }, [key, run]);
  const reload = useCallback(async () => {
    if (key !== null) await run();
  }, [key, run]);
  const setData = useCallback((fn: (prev: T | null) => T | null) => setDataState(fn), []);
  return { data, loading, refreshing, error, refresh, reload, setData };
}

// ---- 피드 ----

export interface FriendFeed {
  posts: FriendPost[]; // 최근 것부터
  hasFriends: boolean | null; // 아직 모르면 null
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: FriendError | null;
  refresh: () => Promise<void>;
  loadMore: () => void;
}

/** 친구 피드 (친구 탭). 당겨서 새로고침, 끝에 닿으면 다음 쪽. */
export function useFriendFeed(): FriendFeed {
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaded = useLoad(
    'feed',
    async () => {
      const [page, friends] = await Promise.all([fetchFriendFeed(null, PAGE), fetchFriends()]);
      return { posts: page.posts, nextCursor: page.nextCursor, hasFriends: friends.length > 0 };
    },
    (d) => {
      clearPatches(d.posts.map((p) => p.id));
      setCursor(d.nextCursor);
    },
  );
  const { setData, reload } = loaded;

  // 친구 관리에서 맺거나 끊으면 다시 불러온다
  const version = useFriendsVersion((s) => s.v);
  const seenVersion = useRef(version);
  useEffect(() => {
    if (seenVersion.current === version) return;
    seenVersion.current = version;
    void reload();
  }, [version, reload]);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    fetchFriendFeed(cursor, PAGE)
      .then((page) => {
        clearPatches(page.posts.map((p) => p.id));
        setCursor(page.nextCursor);
        setData((prev) => {
          if (!prev) return prev;
          const seen = new Set(prev.posts.map((p) => p.id));
          return { ...prev, posts: [...prev.posts, ...page.posts.filter((p) => !seen.has(p.id))] };
        });
      })
      .catch(() => {}) // 다음 쪽 실패는 조용히 둔다: 다시 끝에 닿으면 또 부른다
      .finally(() => setLoadingMore(false));
  }, [cursor, loadingMore, setData]);

  return {
    posts: loaded.data?.posts ?? [],
    hasFriends: loaded.data ? loaded.data.hasFriends : null,
    loading: loaded.loading,
    refreshing: loaded.refreshing,
    loadingMore,
    error: loaded.error,
    refresh: loaded.refresh,
    loadMore,
  };
}

// ---- 친구의 하루 ----

export interface FriendDayState {
  day: FriendDay | null;
  loading: boolean;
  refreshing: boolean;
  error: FriendError | null;
  refresh: () => Promise<void>;
}

/** 친구의 하루 (공유한 기록만). 친구가 아니면 error 'notFound'. */
export function useFriendDay(id: string | undefined, date: string): FriendDayState {
  const loaded = useLoad(
    id ? `${id}|${date}` : null,
    () => fetchFriendDay(id ?? '', date),
    (d) => clearPatches(d.entries.map((p) => p.id)),
  );
  return {
    day: loaded.data,
    loading: loaded.loading,
    refreshing: loaded.refreshing,
    error: loaded.error,
    refresh: loaded.refresh,
  };
}

// ---- 친구 관리 ----

export interface FriendListState {
  friends: FriendSummary[] | null;
  loading: boolean;
  error: FriendError | null;
  refresh: () => Promise<void>;
  /** 코드로 추가. 성공하면 null, 아니면 오류 종류 */
  add: (code: string) => Promise<FriendError | null>;
  /** 친구 끊기. 성공 여부 */
  remove: (id: string) => Promise<boolean>;
}

export function useFriendList(): FriendListState {
  const loaded = useLoad('friends', fetchFriends);
  const { setData } = loaded;
  const add = useCallback(
    async (code: string) => {
      try {
        const f = await addFriend(code);
        setData((prev) => [f, ...(prev ?? []).filter((p) => p.id !== f.id)]);
        bumpFriends();
        return null;
      } catch (e) {
        return toFriendError(e);
      }
    },
    [setData],
  );
  const remove = useCallback(
    async (id: string) => {
      const ok = await unfriend(id);
      if (ok) setData((prev) => (prev ?? []).filter((p) => p.id !== id));
      return ok;
    },
    [setData],
  );
  return { friends: loaded.data, loading: loaded.loading, error: loaded.error, refresh: loaded.refresh, add, remove };
}

/** 친구 끊기 (피드·친구의 하루의 더 보기에서도 쓴다). 성공 여부 */
export async function unfriend(id: string): Promise<boolean> {
  try {
    await removeFriend(id);
    bumpFriends();
    return true;
  } catch {
    return false;
  }
}

export interface FriendCodeState {
  code: string | null;
  loading: boolean;
  error: FriendError | null;
  refresh: () => Promise<void>;
}

/** 내 친구 코드 */
export function useFriendCode(): FriendCodeState {
  const loaded = useLoad('code', fetchFriendCode);
  return { code: loaded.data, loading: loaded.loading, error: loaded.error, refresh: loaded.refresh };
}

// ---- 응원·댓글·사진 ----

const cheering = new Set<string>();

/** 응원 누르기/취소: 화면에 먼저 반영하고, 서버가 실패하면 되돌린다. 보내는 중에는 다시 눌러도 무시한다. */
export function useCheer(post: FriendPost) {
  const p = usePatched(post);
  const toggle = useCallback(() => {
    if (cheering.has(p.id)) return;
    const prev = { cheers: p.cheers, cheered: p.cheered };
    const next = { cheered: !p.cheered, cheers: Math.max(0, p.cheers + (p.cheered ? -1 : 1)) };
    patchPost(p.id, next);
    cheering.add(p.id);
    setCheer(p.id, next.cheered)
      .then((st) => patchPost(p.id, { cheers: st.cheers, cheered: st.cheered }))
      .catch(() => patchPost(p.id, prev))
      .finally(() => cheering.delete(p.id));
  }, [p.id, p.cheers, p.cheered]);
  return { cheered: p.cheered, count: p.cheers, comments: p.comments, toggle };
}

export interface CommentsState {
  comments: FriendComment[] | null;
  loading: boolean;
  error: FriendError | null;
  refresh: () => Promise<void>;
  /** 쓰기. 성공 여부 */
  send: (body: string) => Promise<boolean>;
  /** 내 댓글 지우기. 성공 여부 */
  remove: (id: string) => Promise<boolean>;
}

/** 게시물 하나의 댓글. 수가 바뀌면 피드·친구의 하루의 댓글 수도 같이 바뀐다. */
export function useComments(postId: string | undefined): CommentsState {
  const loaded = useLoad(
    postId ?? null,
    () => fetchComments(postId ?? ''),
    (list) => {
      if (postId) patchPost(postId, { comments: list.length });
    },
  );
  const { setData } = loaded;
  const send = useCallback(
    async (body: string) => {
      if (!postId) return false;
      try {
        const c = await addComment(postId, body);
        setData((prev) => {
          const next = [...(prev ?? []), c];
          patchPost(postId, { comments: next.length });
          return next;
        });
        return true;
      } catch {
        return false;
      }
    },
    [postId, setData],
  );
  const remove = useCallback(
    async (id: string) => {
      if (!postId) return false;
      try {
        await deleteComment(id);
        setData((prev) => {
          const next = (prev ?? []).filter((c) => c.id !== id);
          patchPost(postId, { comments: next.length });
          return next;
        });
        return true;
      } catch {
        return false;
      }
    },
    [postId, setData],
  );
  return { comments: loaded.data, loading: loaded.loading, error: loaded.error, refresh: loaded.refresh, send, remove };
}

/** 게시물 사진 주소 (Authorization 헤더 포함). 사진이 없거나 로그인 전이면 null → 자리표시 */
export function usePhotoSource(post: FriendPost): ImageSourcePropType | null {
  const token = useSession((s) => s.token);
  const { id, hasPhoto } = post;
  // 같은 주소면 같은 객체를 줘서 다시 그릴 때 사진을 또 받지 않게 한다
  return useMemo(() => (hasPhoto && token ? friendPhotoSource(id) : null), [id, hasPhoto, token]);
}
