/** lose 감량 · keep 유지 · gain 린매스업(작은 잉여) · bulk 벌크업(큰 잉여). gain 은 예전 '증량' 값을 그대로 쓴다. */
export type Goal = 'lose' | 'keep' | 'gain' | 'bulk';

/** 하루 목표. 적용한 값은 정수(kcal·g)로 저장한다(서버 호환). 계산 중간값은 nutrition.ts 가 정밀하게 다룬다. */
export interface Targets {
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
}

// 앱 정책: 목표 칼로리 바닥. 서버도 같은 값으로 막는다(TARGET_BELOW_MINIMUM).
export const MIN_KCAL = 1200;

/** 아무 계산도 하기 전의 자리 채움 목표(예전 기본값 70kg 유지와 같은 값). 실제 정보로 계산한 값이 아니다. */
export const PLACEHOLDER_TARGETS: Targets = { kcal: 2100, carbs: 283, protein: 112, fat: 58 };

/** 빈 끼니 칸에 연하게 보여줄 끼니당 목표 */
export function perMealTarget(t: Targets, mealCount: number): Targets {
  const n = Math.max(1, mealCount);
  return {
    kcal: Math.round(t.kcal / n),
    carbs: Math.round(t.carbs / n),
    protein: Math.round(t.protein / n),
    fat: Math.round(t.fat / n),
  };
}

/**
 * 아직 안 찍은 끼니들의 목표: 하루 목표에서 오늘 먹은 만큼을 빼고 남은 끼니 수로 똑같이 나눈다.
 * 다 먹었거나 넘쳤으면 0. 서버 /api/today 의 rows[].target 과 같은 계산.
 */
export function remainingPerMeal(t: Targets, eaten: Targets, remainingMeals: number): Targets {
  const n = Math.max(1, remainingMeals);
  const left = (k: keyof Targets) => Math.max(0, Math.round((t[k] - eaten[k]) / n));
  return { kcal: left('kcal'), carbs: left('carbs'), protein: left('protein'), fat: left('fat') };
}

// ── 날짜별 목표 ─────────────────────────────────────────────
// 목표를 바꾸면 그날부터 새 목표가 적용되고, 그 전 날짜는 예전 목표로 본다(주간 그래프·기록이 소급해서 바뀌지 않게).

/** from 날짜(기기 로컬 YYYY-MM-DD)부터 적용된 목표 */
export interface TargetEntry extends Targets {
  from: string;
}

/** 이력이 시작되기 전 날짜를 모두 덮는 시작 날짜 */
export const HISTORY_START = '2000-01-01';
export const HISTORY_MAX = 400;

const sameTargets = (a: Targets, b: Targets) =>
  a.kcal === b.kcal && a.carbs === b.carbs && a.protein === b.protein && a.fat === b.fat;

/** date 에 적용되던 목표. 이력이 없거나 그 날짜보다 이른 이력이 없으면 current. */
export function targetsOn(history: TargetEntry[], current: Targets, date: string): Targets {
  let hit: TargetEntry | null = null;
  for (const e of history) if (e.from <= date && (!hit || e.from > hit.from)) hit = e;
  if (!hit) return current;
  return { kcal: hit.kcal, carbs: hit.carbs, protein: hit.protein, fat: hit.fat };
}

/**
 * 목표를 prev → next 로 바꿀 때의 새 이력. 처음 바꾸면 예전 목표를 HISTORY_START 부터로 남겨서 지난 날짜를 지킨다.
 * 같은 날 여러 번 바꾸면 그날 항목만 덮는다. 바뀐 게 없으면 그대로.
 */
export function recordTargets(history: TargetEntry[], prev: Targets, next: Targets, today: string): TargetEntry[] {
  if (sameTargets(prev, next)) return history;
  const base = history.length > 0 ? history : [{ from: HISTORY_START, ...prev }];
  const out = base.filter((e) => e.from !== today && e.from < today);
  out.push({ from: today, kcal: next.kcal, carbs: next.carbs, protein: next.protein, fat: next.fat });
  out.sort((a, b) => (a.from < b.from ? -1 : 1));
  return out.slice(-HISTORY_MAX);
}
