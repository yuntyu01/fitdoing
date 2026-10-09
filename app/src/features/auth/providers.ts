import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login as kakaoLogin } from '@react-native-kakao/user';
import { GoogleSignin, isCancelledResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

// 각 서비스의 SDK로 로그인하고 서버에 보낼 토큰을 돌려준다(docs/contract/auth.md).
//   kakao → 액세스 토큰, google → ID 토큰, apple → identityToken
// 사용자가 창을 닫거나 취소하면 null 이다(오류가 아니다). 그 밖의 실패는 던진다.
// 웹은 스크린샷 전용이라 providers.web.ts 가 대신한다.

const KAKAO_NATIVE_APP_KEY = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY ?? '';
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

const codeOf = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;

let kakaoReady = false;
/** 카카오 SDK는 처음 쓸 때 한 번 네이티브 앱 키로 초기화한다. */
async function ensureKakao() {
  if (kakaoReady) return;
  if (!KAKAO_NATIVE_APP_KEY) throw new Error('EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY is not set');
  await initializeKakaoSDK(KAKAO_NATIVE_APP_KEY);
  kakaoReady = true;
}

/** 카카오톡 앱으로 먼저 시도하고, 안 되면 카카오계정(웹뷰) 로그인으로 넘어간다 (SDK 기본 동작). */
export async function loginWithKakao(): Promise<string | null> {
  await ensureKakao();
  try {
    const token = await kakaoLogin();
    return token.accessToken;
  } catch (e) {
    // Cancelled: 로그인 창을 닫음, AccessDenied: 동의 화면에서 취소
    if (codeOf(e) === 'Cancelled' || codeOf(e) === 'AccessDenied') return null;
    throw e;
  }
}

let googleReady = false;
export async function loginWithGoogle(): Promise<string | null> {
  if (!googleReady) {
    if (!GOOGLE_WEB_CLIENT_ID) throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set');
    // 서버가 검증하는 ID 토큰의 audience 가 이 웹 클라이언트 ID 다.
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    googleReady = true;
  }
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (isCancelledResponse(res)) return null;
    if (!res.data.idToken) throw new Error('google idToken missing');
    return res.data.idToken;
  } catch (e) {
    if (codeOf(e) === statusCodes.SIGN_IN_CANCELLED) return null;
    throw e;
  }
}

/** iOS 전용(안드로이드에서는 버튼을 보이지 않는다). */
export async function loginWithApple(): Promise<string | null> {
  if (Platform.OS !== 'ios') throw new Error('Apple sign in is iOS only');
  const Apple = await import('expo-apple-authentication');
  try {
    const cred = await Apple.signInAsync({ requestedScopes: [] });
    if (!cred.identityToken) throw new Error('apple identityToken missing');
    return cred.identityToken;
  } catch (e) {
    if (codeOf(e) === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }
}
