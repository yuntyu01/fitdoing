import { create } from 'zustand';

import { secureDelete, secureGet, secureSet } from './secureStorage';

// 서버 로그인 세션. 토큰은 SecureStore 에 둔다(앱을 껐다 켜도 유지, 90일 뒤 만료되면 서버가 401).
// ownerId 는 "지금 폰 DB 에 들어 있는 기록이 누구 것인가"이다. 로그아웃해도 남겨 두어야
// 다음 로그인 때 같은 계정인지(폰 데이터 유지) 다른 계정인지(폰 데이터 교체)를 가릴 수 있다.

const TOKEN_KEY = 'fitdoing.token';
const USER_KEY = 'fitdoing.userId';
const OWNER_KEY = 'fitdoing.ownerId';

// 개발용: 로그인 없이 쓴다. 서버도 AUTH_DISABLED=1 이어야 한다(아무 토큰이나 dev-user 로 받는다).
export const AUTH_DISABLED = process.env.EXPO_PUBLIC_AUTH_DISABLED === '1';
const DEV_USER = 'dev-user';

export type SessionStatus = 'loading' | 'out' | 'in';

interface SessionState {
  status: SessionStatus;
  token: string | null;
  userId: string | null;
  ownerId: string | null;
}

export const useSession = create<SessionState>(() => ({ status: 'loading', token: null, userId: null, ownerId: null }));

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn('secure store failed', e);
    return fallback;
  }
}

/** 앱 시작 때 한 번: 저장된 세션을 읽어 status 를 'in' 또는 'out' 으로 정한다. */
export async function loadSession(): Promise<void> {
  if (AUTH_DISABLED) {
    useSession.setState({ status: 'in', token: 'dev', userId: DEV_USER, ownerId: DEV_USER });
    return;
  }
  const [token, userId, ownerId] = await Promise.all([
    safe(() => secureGet(TOKEN_KEY), null),
    safe(() => secureGet(USER_KEY), null),
    safe(() => secureGet(OWNER_KEY), null),
  ]);
  const ok = !!token && !!userId;
  useSession.setState({ status: ok ? 'in' : 'out', token: ok ? token : null, userId: ok ? userId : null, ownerId });
}

/** 로그인 성공. 상태를 먼저 바꾸고 저장은 뒤따른다(저장에 실패해도 이번 실행은 로그인된 채로 간다). */
export async function setSession(token: string, userId: string): Promise<void> {
  useSession.setState({ status: 'in', token, userId });
  await safe(async () => {
    await secureSet(TOKEN_KEY, token);
    await secureSet(USER_KEY, userId);
  }, undefined);
}

/** 로그아웃·토큰 만료(401). 폰의 기록과 ownerId 는 그대로 둔다. */
export async function clearSession(): Promise<void> {
  if (useSession.getState().status === 'out') return;
  useSession.setState({ status: 'out', token: null, userId: null });
  await safe(async () => {
    await secureDelete(TOKEN_KEY);
    await secureDelete(USER_KEY);
  }, undefined);
}

/** 폰 DB 의 주인을 바꾼다. null 이면 주인 없음(데이터를 지운 뒤 회원 탈퇴 등). */
export async function setOwnerId(ownerId: string | null): Promise<void> {
  useSession.setState({ ownerId });
  await safe(() => (ownerId ? secureSet(OWNER_KEY, ownerId) : secureDelete(OWNER_KEY)), undefined);
}
