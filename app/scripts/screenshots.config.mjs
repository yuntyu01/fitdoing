// 스크린샷 대상 목록. 화면이 새로 생기면 여기에 한 줄 추가하면 된다.
// - route: expo-router 경로. src/app 에 파일이 없으면 건너뛴다 (아직 안 만든 화면을 미리 적어둬도 된다).
// - name: 출력 파일명 (docs/screenshots/<name>.png)
// - mode: 'app' = 온보딩을 마친 시드 상태(시안 home.png 와 같은 값), 'fresh' = 온보딩 전
// - actions: 찍기 전에 할 일 (예: 시트 열기). (page) => Promise<void>
// - time: 이 화면만 다른 고정 시각으로 찍는다 (잠금 화면은 잠금이 걸린 시각이어야 보인다)
// - fullPage: 스크롤 영역 전체를 찍을지
// 여기에 없는 라우트(동적 [param] 제외)도 자동으로 수집해 mode 'app' 으로 찍는다.

export const VIEWPORT = { width: 390, height: 844 };
export const SCALE = 3;
// 시안 home.png 의 시각: 9월 26일 토요일 18:40 (4끼 마감 19:00 → 20분 남음)
export const FIXED_TIME = '2026-09-26T18:40:00+09:00';
export const TIMEZONE = 'Asia/Seoul';
export const LOCALE = 'ko-KR';
// 노치/홈 인디케이터가 있는 폰 흉내 (시안과 같은 여백)
export const SAFE_AREA = { top: 47, bottom: 34, left: 0, right: 0 };

export const SCREENS = [
  { route: '/', name: 'home' },
  {
    route: '/',
    name: 'home-weekly',
    // 식단 표 아래 주간 그래프가 보이도록 홈 스크롤을 끝까지 내린다
    actions: async (page) => {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('div')) {
          if (el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = el.scrollHeight;
        }
      });
      await page.waitForTimeout(400);
    },
  },
  { route: '/records', name: 'records' },
  { route: '/settings', name: 'settings', fullPage: true },
  {
    route: '/settings',
    name: 'coupon-sheet',
    actions: async (page) => {
      // 하단 탭바가 가려 locator.click 이 막히므로, 텍스트 위치를 구해 직접 누른다.
      const row = page.getByText(/휴식 2 · 치팅 2/).first();
      await row.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      const box = await row.boundingBox();
      if (!box) throw new Error('쿠폰 줄을 못 찾았어요');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      // 시각이 고정돼 있으면 Animated 가 진행하지 않는다. 시트가 다 올라올 만큼 시각을 조금 밀어 준다.
      const t0 = new Date(FIXED_TIME).getTime();
      for (const dt of [150, 300, 500, 800]) {
        await page.clock.setFixedTime(new Date(t0 + dt));
        await page.waitForTimeout(120);
      }
    },
  },
  { route: '/onboarding', name: 'onboarding-1-goal', mode: 'fresh' },
  { route: '/onboarding/meals', name: 'onboarding-2-meals', mode: 'fresh' },
  { route: '/onboarding/routine', name: 'onboarding-3-routine', mode: 'fresh' },
  { route: '/onboarding/permissions', name: 'onboarding-4-permissions', mode: 'fresh' },
  { route: '/edit/profile', name: 'edit-profile' },
  { route: '/edit/meals', name: 'edit-meals' },
  { route: '/edit/gym', name: 'edit-gym' },
  { route: '/edit/sleep', name: 'edit-sleep' },
  { route: '/edit/mode', name: 'edit-mode' },
  { route: '/edit/targets', name: 'edit-targets' },

  // 아직 없는 화면 (다른 작업에서 만드는 중). 라우트가 생기면 자동으로 찍힌다. 경로는 실제에 맞게 고칠 것.
  { route: '/camera', name: 'camera' },
  { route: '/review', name: 'review' },
  // 잠금 화면 (시드 설정 저장 시각 9/26 18:40 이후여야 걸린다): 토 19:05는 헬스 요일이라 헬스 잠금, 화 19:05는 헬스 없는 날의 끼니 잠금 (헬스 요일: 월·수·금·토·일)
  { route: '/lock/meal', name: 'lock-meal', time: '2026-09-29T19:05:00+09:00' },
  { route: '/lock/gym', name: 'lock-gym', time: '2026-09-26T19:05:00+09:00' },
  { route: '/lock/sleep', name: 'lock-sleep', time: '2026-09-26T23:45:00+09:00' },
  { route: '/coupons', name: 'coupons' },
  { route: '/health', name: 'health' },
];
