import { deleteAccount } from '../api/client';
import { wipeLocalData } from './restore';
import { clearSession, setOwnerId } from './session';

/** 로그아웃: 세션만 지운다. 폰의 기록은 그대로이고, 다음 로그인 때 domain/auth.ts 규칙을 따른다. */
export function logout(): Promise<void> {
  return clearSession();
}

/**
 * 회원 탈퇴: 서버의 계정·백업을 지우고(되돌릴 수 없다), 폰의 기록·대기 중인 백업·ownerId 도 지운 뒤 로그인 화면으로 돌아간다.
 * 서버 삭제가 실패하면 던지고 아무것도 지우지 않는다.
 */
export async function deleteAccountAndData(): Promise<void> {
  await deleteAccount();
  await clearSession();
  // 로그인 화면으로 바뀌어 기록 화면들이 내려간 다음에 설정 스토어를 비운다(화면이 설정 없이 그려지지 않게).
  await new Promise((r) => setTimeout(r, 50));
  await setOwnerId(null);
  await wipeLocalData();
}
