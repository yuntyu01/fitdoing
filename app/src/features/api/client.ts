import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

import type { AiResult, Settings } from '../../db/schema';
import { sanitizeItem, type MealBackup } from '../../domain/logging';
import type { Provider } from '../../domain/auth';
import type { Snapshot } from '../../domain/restore';
import {
  backoffMs,
  drainQueue,
  mealQueueKey,
  toSettingsBody,
  type QueueItem,
  type SyncRequest,
} from '../../domain/sync';
import { clearSession, useSession } from '../auth/session';
import type { CheerState, FeedPage, FriendComment, FriendDay, FriendSummary } from '../friends/types';
import { pushItems, readQueue, removeItems, writeMeta } from './store';

// 서버는 AI 중계와 기록 백업만 맡는다. 잠금·기록은 로컬 SQLite가 진실이라
// 서버가 죽어 있어도 앱은 그대로 동작해야 한다. 여기서 던진 오류는 호출한 쪽이 삼킨다.
// 로그인은 필수이고, 백업은 기기가 아니라 로그인한 계정 단위로 쌓인다(Authorization: Bearer <서버 토큰>).
// 서버가 401을 주면(토큰 만료·탈퇴) 세션을 지워 로그인 화면으로 돌려보내고, 폰의 기록과 대기 중인 백업은 그대로 둔다.
//
// 개인정보: 사진이 폰 밖으로 나가는 경우는 세 가지뿐이고, 모두 긴 변 1024px로 줄인 사본이다.
// - AI 분석(analyzeMeal): 서버는 저장하지 않고 결과 JSON만 돌려준다.
// - 사진 백업(send의 upload): 사용자가 설정에서 켰을 때만. 서버(운영은 Cloudflare R2)에 계정 단위로 저장되고,
//   끄면 서버의 사진을 모두 지운다(photoWipe). 회원 탈퇴 때도 함께 지워진다.
// - 친구에게 공유한 끼니(기록 확인에서 켠 끼니만): 친구가 볼 수 있게 그 끼니 사진을 같은 자리(send의 upload)에 저장한다.
//   공유 없이 다시 기록하면 그 끼니 사진을 지운다(trackMealPhoto). 사진 백업을 끄면 공유 끼니 사진도 함께 지워진다.

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8080').replace(/\/+$/, '');

const ANALYZE_TIMEOUT_MS = 30_000;
const BACKUP_TIMEOUT_MS = 10_000;
const SNAPSHOT_TIMEOUT_MS = 20_000;
const PHOTO_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestInit {
  method: string;
  body?: string | FormData;
  json?: boolean;
  /** 로그인 직후처럼 세션에 아직 없는 토큰을 직접 쓸 때 */
  token?: string;
  /** 로그인 요청: Authorization 없이 보내고, 401이어도 세션을 건드리지 않는다 */
  anonymous?: boolean;
}

async function request(path: string, init: RequestInit, timeoutMs: number) {
  const headers: Record<string, string> = {};
  if (!init.anonymous) {
    const token = init.token ?? useSession.getState().token;
    if (!token) throw new ApiError(401, 'not logged in'); // 로그인 전에는 서버를 부르지 않는다
    headers.Authorization = `Bearer ${token}`;
  }
  if (init.json) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: init.method,
      body: init.body,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 401 && !init.anonymous && !init.token) void clearSession();
      throw new ApiError(res.status, await res.text().catch(() => ''));
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** 사진 한 장을 보내 음식 인식 결과를 받는다. photoUri는 이미 긴 변 1024px로 줄인 파일이어야 한다. */
export async function analyzeMeal(photoUri: string): Promise<AiResult> {
  const form = new FormData();
  // expo/fetch의 FormData는 expo-file-system File(Blob)을 파트로 받는다.
  form.append('photo', new File(photoUri));
  const res = await request('/api/meals/analyze', { method: 'POST', body: form }, ANALYZE_TIMEOUT_MS);
  const data = (await res.json()) as Partial<AiResult>;
  return {
    items: Array.isArray(data.items) ? data.items.map(sanitizeItem) : [], // 음식별 칼로리·탄단지도 같이 받는다
    kcal: Number(data.kcal) || 0,
    carbs: Number(data.carbs) || 0,
    protein: Number(data.protein) || 0,
    fat: Number(data.fat) || 0,
    confidence: Number(data.confidence) || 0,
  };
}

// ---- 로그인·계정 ----

/** 카카오·구글·애플에서 받은 토큰을 서버에 보내 우리 로그인 토큰을 받는다. */
export async function loginToServer(
  provider: Provider,
  token: string,
): Promise<{ token: string; userId: string; isNew: boolean }> {
  const res = await request(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify({ provider, token }), json: true, anonymous: true },
    BACKUP_TIMEOUT_MS,
  );
  const data = (await res.json()) as { token?: string; userId?: string; isNew?: boolean };
  if (!data.token || !data.userId) throw new Error('invalid login response');
  return { token: data.token, userId: data.userId, isNew: data.isNew === true };
}

/** 회원 탈퇴: 서버의 계정과 백업을 모두 지운다(204). */
export async function deleteAccount(): Promise<void> {
  await request('/api/account', { method: 'DELETE' }, BACKUP_TIMEOUT_MS);
}

/** 복원용 전체 스냅샷. 로그인 직후에는 아직 세션에 없는 토큰을 직접 넘긴다. */
export async function fetchSnapshot(token?: string): Promise<Snapshot> {
  const res = await request('/api/sync/snapshot', { method: 'GET', token }, SNAPSHOT_TIMEOUT_MS);
  return (await res.json()) as Snapshot;
}

/** 백업해 둔 끼니 사진을 받는다(새 폰 복원). 없으면 null. 네트워크 오류는 던진다. */
export async function downloadMealPhoto(date: string, index: number): Promise<Uint8Array | null> {
  try {
    const res = await request(`/api/meals/photo?date=${date}&index=${index}`, { method: 'GET' }, PHOTO_TIMEOUT_MS);
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 503)) return null;
    throw e;
  }
}

async function send(req: SyncRequest): Promise<number | null> {
  try {
    if (req.upload) {
      // 사진 백업(사용자가 켰을 때만). 그 사이 끼니를 다시 찍어 파일이 지워졌으면 보낼 게 없다 → 버린다(410).
      const file = new File(req.upload.uri);
      if (!file.exists) return 410;
      const form = new FormData();
      form.append('photo', file);
      const res = await request(req.path, { method: req.method, body: form }, PHOTO_TIMEOUT_MS);
      return res.status;
    }
    const res = await request(
      req.path,
      req.body === null ? { method: req.method } : { method: req.method, body: JSON.stringify(req.body), json: true },
      BACKUP_TIMEOUT_MS,
    );
    return res.status;
  } catch (e) {
    return e instanceof ApiError ? e.status : null; // 네트워크 오류·타임아웃은 null
  }
}

let flushing = false;
let failures = 0;
let nextAttemptAt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 쌓인 백업을 보낸다(설정 → 끼니 → 이벤트 묶음). 네트워크·5xx면 멈추고 백오프 뒤 다시, 4xx로 거절된 건 버린다.
 * 로그인하지 않았거나 401이면 큐를 그대로 두고 멈춘다(다시 로그인하면 startSync 가 이어서 보낸다).
 * force가 아니면 백오프 중에는 건너뛴다(앱 시작·포그라운드 복귀는 force).
 */
export async function flushQueue(force = false): Promise<void> {
  if (flushing) return;
  if (!useSession.getState().token) return;
  if (!force && Date.now() < nextAttemptAt) return;
  flushing = true;
  try {
    const res = await drainQueue({
      read: readQueue,
      remove: removeItems,
      send,
      warn: (m, d) => console.warn(m, d),
    });
    if (res.unauthorized) {
      // 401: request()가 이미 세션을 지웠다. 재시도 타이머는 의미가 없으니 로그인 뒤 flushQueue(true)에 맡긴다.
      if (retryTimer) clearTimeout(retryTimer);
    } else if (res.failed) {
      failures += 1;
      const wait = backoffMs(failures);
      nextAttemptAt = Date.now() + wait;
      if (retryTimer) clearTimeout(retryTimer);
      // 앱이 켜져 있는 동안 네트워크가 돌아오면 이 재시도가 큐를 비운다.
      retryTimer = setTimeout(() => void flushQueue().catch(() => {}), wait);
    } else {
      failures = 0;
      nextAttemptAt = 0;
      if (res.sent > 0) writeMeta({ lastSyncAt: Date.now() });
    }
  } catch (e) {
    console.warn('flush failed', e);
  } finally {
    flushing = false;
  }
}

/** 큐에 넣고 잠깐 모았다가(여러 기록이 연달아 생기는 경우) 한 번에 보낸다. 던지지 않는다. */
export async function enqueueItems(items: QueueItem[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const dropped = await pushItems(items);
    if (dropped > 0) writeMeta({ initialDone: false }); // 넘쳐서 버렸다: 다음 기회에 로컬 전체를 다시 올린다.
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => void flushQueue().catch(() => {}), 1500);
  } catch (e) {
    console.warn('enqueue failed', e);
  }
}

/** 끼니 기록 백업 (best effort). 실패해도 로컬 기록에는 영향이 없다. */
export function backupMeal(body: MealBackup): Promise<void> {
  return enqueueItems([{ kind: 'meal', key: mealQueueKey(body.date, body.index), body }]);
}

/** 설정 백업 (best effort). PUT /api/sync/settings 로 값 그대로 올린다. */
export function backupSettings(s: Settings): Promise<void> {
  return enqueueItems([{ kind: 'settings', key: 'settings', body: toSettingsBody(s) }]);
}

// ---- 친구 (features/friends) ----
// 친구 기록은 서버에만 있다(로컬 SQLite에 없음). 실패하면 던지고, 화면이 안내·다시 시도를 보여 준다.

const FRIENDS_TIMEOUT_MS = 10_000;

async function getJson<T>(path: string): Promise<T> {
  const res = await request(path, { method: 'GET' }, FRIENDS_TIMEOUT_MS);
  return (await res.json()) as T;
}

async function sendJson<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await request(path, { method, body: JSON.stringify(body), json: true }, FRIENDS_TIMEOUT_MS);
  return (await res.json()) as T;
}

/** 내 친구 코드 (처음 부를 때 서버가 만든다) */
export async function fetchFriendCode(): Promise<string> {
  return (await getJson<{ code: string }>('/api/friends/code')).code;
}

/** 친구 코드로 친구 추가 (양방향). 없는 코드 404, 내 코드 400. */
export function addFriend(code: string): Promise<FriendSummary> {
  return sendJson<FriendSummary>('POST', '/api/friends', { code });
}

export function fetchFriends(): Promise<FriendSummary[]> {
  return getJson<FriendSummary[]>('/api/friends');
}

/** 친구 끊기 (양방향) */
export async function removeFriend(id: string): Promise<void> {
  await request(`/api/friends/${encodeURIComponent(id)}`, { method: 'DELETE' }, FRIENDS_TIMEOUT_MS);
}

/** 친구 피드 한 쪽. before는 이전 쪽의 nextCursor. */
export function fetchFriendFeed(before?: string | null, limit = 20): Promise<FeedPage> {
  const q = `limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
  return getJson<FeedPage>(`/api/friends/feed?${q}`);
}

/** 친구의 하루 (공유한 기록만). 친구가 아니면 404. */
export function fetchFriendDay(id: string, date: string): Promise<FriendDay> {
  return getJson<FriendDay>(`/api/friends/${encodeURIComponent(id)}/day?date=${date}`);
}

/** 응원(on) / 응원 취소. 취소는 본문 없는 DELETE라 postId를 쿼리로 보낸다. */
export async function setCheer(postId: string, on: boolean): Promise<CheerState> {
  if (on) return sendJson<CheerState>('POST', '/api/friends/cheers', { postId });
  const res = await request(
    `/api/friends/cheers?postId=${encodeURIComponent(postId)}`,
    { method: 'DELETE' },
    FRIENDS_TIMEOUT_MS,
  );
  return (await res.json()) as CheerState;
}

export function fetchComments(postId: string): Promise<FriendComment[]> {
  return getJson<FriendComment[]>(`/api/friends/comments?postId=${encodeURIComponent(postId)}`);
}

export function addComment(postId: string, body: string): Promise<FriendComment> {
  return sendJson<FriendComment>('POST', '/api/friends/comments', { postId, body });
}

/** 내 댓글 지우기 */
export async function deleteComment(id: string): Promise<void> {
  await request(`/api/friends/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }, FRIENDS_TIMEOUT_MS);
}

/** 친구가 공유한 끼니 사진. RN Image가 Authorization 헤더를 실어 직접 받는다. 로그인 전이면 null. */
export function friendPhotoSource(postId: string): { uri: string; headers: Record<string, string> } | null {
  const token = useSession.getState().token;
  if (!token) return null;
  return {
    uri: `${API_URL}/api/friends/photo?postId=${encodeURIComponent(postId)}`,
    headers: { Authorization: `Bearer ${token}` },
  };
}

// ---- 공유 페이지 (내 식단 공개 링크) ----

/** 공유 페이지 상태. url은 켜져 있을 때만 있다. */
export interface ShareStatus {
  enabled: boolean;
  token: string;
  url: string;
}

const shareCall = async (method: string, path = '/api/share'): Promise<ShareStatus> => {
  const res = await request(path, { method }, FRIENDS_TIMEOUT_MS);
  return (await res.json()) as ShareStatus;
};

export const fetchShare = () => shareCall('GET');
/** 켜기 (처음이면 주소를 만든다, 다시 켜면 같은 주소) */
export const enableShare = () => shareCall('POST');
/** 끄기: 주소가 바로 막힌다 */
export const disableShare = () => shareCall('DELETE');
/** 새 주소로 바꾸기: 예전 링크는 더 이상 열리지 않는다 */
export const rotateShare = () => shareCall('POST', '/api/share/rotate');
