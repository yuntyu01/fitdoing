import { decideAfterLogin } from './auth';

const base = { ownerId: 'u1', userId: 'u1', hasLocalSettings: true };

describe('decideAfterLogin', () => {
  it('같은 계정이고 폰에 설정이 있으면 그대로 둔다 (서버를 부르지 않는다)', () => {
    expect(decideAfterLogin(base)).toBe('keep');
  });

  it('로그인 도입 전부터 쓰던 폰(주인 없음)이고 설정이 있으면 올린다', () => {
    expect(decideAfterLogin({ ...base, ownerId: null })).toBe('push');
  });

  it('다른 계정으로 로그인하면 서버 설정 여부를 먼저 확인한다', () => {
    expect(decideAfterLogin({ ...base, ownerId: 'other' })).toBe('need-snapshot');
    expect(decideAfterLogin({ ...base, ownerId: 'other', serverHasSettings: true })).toBe('restore');
    expect(decideAfterLogin({ ...base, ownerId: 'other', serverHasSettings: false })).toBe('reset');
  });

  it('폰에 설정이 없으면(새로 깐 폰) 서버에 있을 때 복원, 없으면 온보딩', () => {
    const fresh = { ownerId: null, userId: 'u1', hasLocalSettings: false };
    expect(decideAfterLogin(fresh)).toBe('need-snapshot');
    expect(decideAfterLogin({ ...fresh, serverHasSettings: true })).toBe('restore');
    expect(decideAfterLogin({ ...fresh, serverHasSettings: false })).toBe('reset');
  });

  it('주인은 같은데 설정이 사라진 폰(키체인만 남은 재설치)도 서버에서 복원한다', () => {
    const c = { ownerId: 'u1', userId: 'u1', hasLocalSettings: false };
    expect(decideAfterLogin(c)).toBe('need-snapshot');
    expect(decideAfterLogin({ ...c, serverHasSettings: true })).toBe('restore');
  });

  it('서버 정보가 이미 있어도 같은 계정이면 폰 데이터가 우선이다', () => {
    expect(decideAfterLogin({ ...base, serverHasSettings: false })).toBe('keep');
    expect(decideAfterLogin({ ...base, ownerId: null, serverHasSettings: true })).toBe('push');
  });
});
