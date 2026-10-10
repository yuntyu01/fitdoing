// 스크린샷 대상 목록. 화면이 새로 생기면 여기에 한 줄 추가하면 된다.
// - route: expo-router 경로. src/app 에 파일이 없으면 건너뛴다 (아직 안 만든 화면을 미리 적어둬도 된다).
// - name: 출력 파일명 (docs/screenshots/<name>.png)
// - mode: 'app' = 온보딩을 마친 시드 상태(시안 home.png 와 같은 값), 'fresh' = 온보딩 전, 'loggedOut' = 로그인 전
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

// 시트를 열고 Animated 가 끝까지 가도록 고정 시각을 조금씩 민다 (시각이 고정돼 있으면 애니메이션이 진행하지 않는다).
async function openByText(page, text) {
  const el = page.getByText(text, { exact: true }).first();
  // 떠 있는 탭바 뒤에 있으면 클릭이 탭바로 가므로 화면 가운데로 굴린다
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  const box = await el.boundingBox();
  if (!box) throw new Error(`'${text}' 를 못 찾았어요`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const t0 = new Date(FIXED_TIME).getTime();
  for (const dt of [150, 300, 500, 800]) {
    await page.clock.setFixedTime(new Date(t0 + dt));
    await page.waitForTimeout(120);
  }
}

// 웹 스택은 지나온 화면도 DOM 에 남겨 두므로 마지막(지금 화면) 요소를 고른다
async function tap(page, text) {
  const el = page.getByText(text, { exact: true }).last();
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await el.click();
  await page.waitForTimeout(300);
}

async function fill(page, label, value) {
  await page.getByLabel(label, { exact: true }).last().fill(value);
  await page.waitForTimeout(100);
}

/** 영양 목표 1단계에서 n단계까지: 남성 · 40세 · 172cm · 70kg → 저활동적 → 일반 균형 */
async function nutritionTo(page, n) {
  await tap(page, '남성');
  await fill(page, '만 나이', '40');
  await fill(page, '키', '172');
  await fill(page, '현재 체중', '70');
  await tap(page, '다음');
  if (n === 2) return;
  await tap(page, '주로 앉아 있어요');
  await tap(page, '근력 운동');
  await tap(page, '저활동적');
  await tap(page, '다음');
  if (n === 3) return;
  await tap(page, '결과 보기');
}

export const SCREENS = [
  { route: '/', name: 'home' },
  {
    route: '/',
    name: 'home-weekly',
    // 식단 표 아래 주간 그래프가 보이도록 홈 스크롤을 끝까지 내린다
    actions: async (page) => {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('div')) {
          if (el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY !== 'visible')
            el.scrollTop = el.scrollHeight;
        }
      });
      await page.waitForTimeout(400);
    },
  },
  { route: '/records', name: 'records' },
  { route: '/records', name: 'records-month-picker', actions: (page) => openByText(page, '2026년 9월') },
  { route: '/settings', name: 'settings', fullPage: true },
  { route: '/settings', name: 'coupon-sheet', actions: (page) => openByText(page, '쿠폰') },
  { route: '/login', name: 'login', mode: 'loggedOut' },
  { route: '/onboarding', name: 'onboarding-1-goal', mode: 'fresh' },
  { route: '/onboarding/meals', name: 'onboarding-5-meals', mode: 'fresh' },
  { route: '/onboarding/routine', name: 'onboarding-6-routine', mode: 'fresh' },
  { route: '/onboarding/permissions', name: 'onboarding-7-permissions', mode: 'fresh' },
  { route: '/edit/profile', name: 'edit-profile' },
  { route: '/edit/meals', name: 'edit-meals' },
  { route: '/edit/gym', name: 'edit-gym' },
  { route: '/edit/sleep', name: 'edit-sleep' },
  { route: '/edit/mode', name: 'edit-mode' },
  // 영양 목표 4단계 (신체·목표 → 활동 → 계산 모드 → 결과). 2~4단계는 1단계에서 이어 들어가야 열린다.
  { route: '/edit/nutrition', name: 'nutrition-1-body' },
  { route: '/edit/nutrition', name: 'nutrition-2-activity', actions: (p) => nutritionTo(p, 2) },
  { route: '/edit/nutrition', name: 'nutrition-3-plan', actions: (p) => nutritionTo(p, 3) },
  {
    route: '/edit/nutrition',
    name: 'nutrition-3-plan-custom',
    actions: async (p) => {
      await nutritionTo(p, 3);
      await tap(p, '직접 설정');
    },
  },
  {
    route: '/edit/nutrition',
    name: 'nutrition-3-plan-advanced',
    actions: async (p) => {
      await nutritionTo(p, 3);
      await tap(p, '운동 중심');
      await tap(p, '고급 식단 설정');
      await tap(p, '케토');
    },
  },
  { route: '/edit/nutrition', name: 'nutrition-4-result', actions: (p) => nutritionTo(p, 4) },
  { route: '/edit/food-style', name: 'edit-food-style' },

  { route: '/capture/review', name: 'review' },
  { route: '/capture/review', name: 'review-portion-sheet', actions: (page) => openByText(page, '100%') },
  // 저장한 끼니 수정 (음식별 먹은 양) + 음식 하나의 먹은 양 시트
  { route: '/capture/review?date=2026-09-26&index=2&edit=1', name: 'review-edit' },
  {
    route: '/capture/review?date=2026-09-26&index=2&edit=1',
    name: 'review-food-portion',
    actions: (page) => openByText(page, '100%'),
  },
  { route: '/settings', name: 'theme-sheet', actions: (page) => openByText(page, '화면 모드') },
  { route: '/emergency', name: 'emergency' }, // 걸린 잠금이 없을 때
  // 기록 탭에서 기록이 없는 날(9/2)을 고른 상태
  { route: '/records', name: 'records-empty-day', actions: (page) => openByText(page, '2') },
  // 쿼리로 여는 화면 (파일 경로만 확인하고 쿼리는 그대로 연다)
  { route: '/day?date=2026-09-26', name: 'day' },
  { route: '/friend?id=sample-minsu', name: 'friend' }, // 친구 기능은 개발용 예시 데이터 (features/friends/sample.ts)
  { route: '/friends', name: 'friends' },
  // 잠금 화면 (시드 설정 저장 시각 9/26 18:40 이후여야 걸린다): 토 19:05는 헬스 요일이라 헬스 잠금, 화 19:05는 헬스 없는 날의 끼니 잠금 (헬스 요일: 월·수·금·토·일)
  { route: '/lock/meal', name: 'lock-meal', time: '2026-09-29T19:05:00+09:00' },
  { route: '/lock/gym', name: 'lock-gym', time: '2026-09-26T19:05:00+09:00' },
  { route: '/lock/sleep', name: 'lock-sleep', time: '2026-09-26T23:45:00+09:00' },
];
