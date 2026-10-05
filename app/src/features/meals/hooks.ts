// 끼니를 기록한 직후 다른 기능(잠금 엔진 등)이 반응할 수 있는 얇은 훅 포인트.
// 잠금 쪽은 앱 시작 시 `onMealLogged(() => releaseMealLock())` 처럼 등록한다.
// 등록된 게 없으면 아무 일도 일어나지 않고, 핸들러가 던져도 기록에는 영향이 없다.

export interface MealLoggedEvent {
  date: string; // 이 끼니가 속한 날 'YYYY-MM-DD'
  index: number; // 끼니 번호 (1부터)
  loggedAt: number; // epoch ms
}

type Handler = (e: MealLoggedEvent) => void | Promise<void>;

const handlers = new Set<Handler>();

/** 등록하고, 해제 함수를 돌려준다. */
export function onMealLogged(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export async function notifyMealLogged(e: MealLoggedEvent): Promise<void> {
  for (const h of [...handlers]) {
    try {
      await h(e);
    } catch (err) {
      console.warn('meal logged handler failed', err);
    }
  }
}
