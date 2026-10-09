// 웹은 스크린샷 전용(scripts/screenshots.mjs). SecureStore 가 웹을 지원하지 않으므로 메모리에 둔다.
// 평소에는 로그인된 상태로 시작하고, 스크린샷 스크립트가 window.__FD_LOGGED_OUT__ = true 를 심으면 로그아웃 상태로 시작한다.

const loggedOut = (globalThis as { __FD_LOGGED_OUT__?: boolean }).__FD_LOGGED_OUT__ === true;

const memory = new Map<string, string>(
  loggedOut
    ? []
    : [
        ['fitdoing.token', 'preview-token'],
        ['fitdoing.userId', 'preview-user'],
        ['fitdoing.ownerId', 'preview-user'],
      ],
);

export const secureGet = async (key: string): Promise<string | null> => memory.get(key) ?? null;
export const secureSet = async (key: string, value: string): Promise<void> => void memory.set(key, value);
export const secureDelete = async (key: string): Promise<void> => void memory.delete(key);
