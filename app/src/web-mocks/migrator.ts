// 웹 스크린샷용: 마이그레이션은 이미 끝난 것으로 본다.
export function useMigrations() {
  return { success: true as const, error: undefined };
}
