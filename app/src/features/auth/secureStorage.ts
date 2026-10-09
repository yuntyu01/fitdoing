import * as SecureStore from 'expo-secure-store';

// 로그인 토큰 같은 작은 비밀값 저장소. 안드로이드는 Keystore, iOS는 키체인에 들어간다.
// 웹은 지원하지 않으므로 secureStorage.web.ts 가 대신한다(스크린샷 전용).

export const secureGet = (key: string): Promise<string | null> => SecureStore.getItemAsync(key);
export const secureSet = (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value);
export const secureDelete = (key: string): Promise<void> => SecureStore.deleteItemAsync(key);
