// 로그인 뒤에 폰 데이터를 어떻게 할지 정하는 순수 로직. RN·DB에 기대지 않는다.

export type Provider = 'kakao' | 'google' | 'apple';

export interface LoginContext {
  /** 지금 폰 DB에 들어 있는 기록의 주인(userId). 로그인 기능이 생기기 전부터 쓰던 설치본이면 null */
  ownerId: string | null;
  /** 방금 로그인한 계정 */
  userId: string;
  /** 폰 DB에 설정(온보딩 결과)이 있는가 */
  hasLocalSettings: boolean;
  /** 서버 스냅샷에 설정이 있는가. 아직 안 불렀으면 undefined */
  serverHasSettings?: boolean;
}

/**
 * - keep: 폰 데이터를 그대로 두고 동기화만 켠다 (같은 계정)
 * - push: 폰 데이터를 그대로 두고 전부 서버로 올린다 (로그인 도입 전부터 쓰던 폰)
 * - restore: 폰 데이터를 지우고 서버 스냅샷으로 채운다
 * - reset: 폰 데이터를 지우고 온보딩부터 시작한다
 * - need-snapshot: 서버에 설정이 있는지 알아야 정할 수 있다 (serverHasSettings를 채워 다시 부른다)
 */
export type LoginAction = 'keep' | 'push' | 'restore' | 'reset' | 'need-snapshot';

export function decideAfterLogin(c: LoginContext): LoginAction {
  if (c.hasLocalSettings) {
    if (c.ownerId === c.userId) return 'keep';
    if (c.ownerId === null) return 'push';
  }
  // 다른 계정의 데이터이거나, 폰에 설정이 없다(새로 깐 폰·앱 데이터를 지운 폰).
  if (c.serverHasSettings === undefined) return 'need-snapshot';
  return c.serverHasSettings ? 'restore' : 'reset';
}
