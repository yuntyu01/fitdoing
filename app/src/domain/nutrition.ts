import { MIN_KCAL, type Goal, type Targets } from './targets';

// 영양 목표 계산. 근거와 앱이 고른 시작값은 docs/nutrition-targets.md 에 나눠 적었다.
// - 유지 칼로리: 2025 한국인 영양소 섭취기준(KDRI) 성인(19세 이상) 에너지필요추정량(EER) 식과 신체활동단계별계수(PA).
// - 목표 조정률, 탄단지 시작값, 50kcal 반올림, 1200kcal 바닥: 앱 정책(KDRI 공식 값이 아니다).
// 계산은 반올림 없이 하고, 적용할 때(toTargets)와 화면에서만 반올림한다.

/** 산식 버전: EER 식·PA 계수를 바꾸면 올린다. */
export const FORMULA_VERSION = 'kdri2025-eer-adult';
/** 앱 정책 버전: 조정률 시작값·배분·반올림 규칙을 바꾸면 올린다. */
export const POLICY_VERSION = 'fitdoing-2026.10';

export type Sex = 'male' | 'female';
/** KDRI 신체활동단계: 비활동적 · 저활동적 · 활동적 · 매우 활동적 */
export type Activity = 'sedentary' | 'low' | 'active' | 'veryActive';
export const ACTIVITIES: Activity[] = ['sedentary', 'low', 'active', 'veryActive'];

/** 2025 KDRI 표 2, 성인. 신체활동수준(PAL) 1.00-1.39 / 1.40-1.59 / 1.60-1.89 / 1.90-2.50 */
export const PA: Record<Sex, Record<Activity, number>> = {
  male: { sedentary: 1.0, low: 1.11, active: 1.25, veryActive: 1.48 },
  female: { sedentary: 1.0, low: 1.12, active: 1.27, veryActive: 1.45 },
};
export const PAL_RANGE: Record<Activity, string> = {
  sedentary: '1.00-1.39',
  low: '1.40-1.59',
  active: '1.60-1.89',
  veryActive: '1.90-2.50',
};

/** 성인 EER 식이 정의된 나이 */
export const ADULT_AGE = 19;
export const AGE_MIN = 10;
export const AGE_MAX = 100;

/** 2025 KDRI 에너지적정비율(AMDR), 19세 이상 성인, 총열량 대비 %. 참고 범위이지 막는 기준이 아니다. */
export const AMDR = { carbs: [50, 65], protein: [10, 20], fat: [15, 30] } as const;

export type Macro = 'carbs' | 'protein' | 'fat';
export const MACROS: Macro[] = ['carbs', 'protein', 'fat'];
export const KCAL_PER_G: Record<Macro, number> = { carbs: 4, protein: 4, fat: 9 };

/** 탄수 : 단백질 : 지방, 총열량 대비 % (무게 비율이 아니다) */
export type Ratio = [number, number, number];

// ── 활동량 입력 ────────────────────────────────────────────
// 일상 활동과 운동은 사용자가 단계를 고를 때 참고하려고 저장한다. 검증된 환산표가 없으므로 이 값으로 단계를 자동 확정하지 않는다.

export type DailyActivity = 'sitting' | 'standing' | 'walking' | 'manual';
export type ExerciseType = 'none' | 'strength' | 'cardio' | 'mixed' | 'sports';
export type Intensity = 'light' | 'moderate' | 'vigorous';

export interface ActivityInput {
  daily: DailyActivity | null;
  exercise: { type: ExerciseType; perWeek: number; minutes: number; intensity: Intensity | null };
}

export const emptyActivityInput = (): ActivityInput => ({
  daily: null,
  exercise: { type: 'none', perWeek: 0, minutes: 0, intensity: null },
});

// ── 계산 모드 ─────────────────────────────────────────────

export type PlanMode = 'balanced' | 'training' | 'custom';

/** 고급 탄수 제한. 케토는 총탄수 g 로만 정한다(식이섬유 데이터가 없어 순탄수를 계산하지 않는다). */
export type CarbLimit =
  | { kind: 'none' }
  | { kind: 'lowCarb' | 'lchf'; by: 'pct' | 'grams'; value: number }
  | { kind: 'keto'; by: 'grams'; value: number };

export type CustomPlan =
  | { kind: 'ratio'; kcal: number; ratio: Ratio }
  /** kcal 과 영양소 2개를 고정하고 나머지 하나를 계산 */
  | { kind: 'fixKcal'; kcal: number; solve: Macro; grams: Record<Macro, number> }
  /** 탄단지 g 3개로 총 kcal 을 계산 */
  | { kind: 'grams'; grams: Record<Macro, number> };

export type Plan =
  | { mode: 'balanced'; ratio: Ratio; carb: CarbLimit }
  | { mode: 'training'; proteinPerKg: number; fatPct: number; carb: CarbLimit }
  | { mode: 'custom'; custom: CustomPlan };

/** 일반 자동 계산을 쓰면 안 되는 상황. 하나라도 있으면 직접 설정만 쓴다. */
export interface Eligibility {
  pregnant: boolean;
  lactating: boolean;
  medicalDiet: boolean;
}

/** 저장하는 계산 입력(원본). 최종 목표는 Settings.targets 에 따로 둔다. */
export interface NutritionSettings {
  formula: string;
  policy: string;
  /** 목표 조정률(%) — 앱 정책. null 이면 목표별 시작값 */
  goalAdjustPct: number | null;
  plan: Plan;
  eligibility: Eligibility;
  /** 마지막으로 적용한 날짜 (YYYY-MM-DD) */
  appliedOn: string | null;
}

// ── 앱 시작값 (정책) ───────────────────────────────────────

/** 목표 조정률 시작값(%). KDRI 값이 아니라 앱이 고른 출발점이고, 사용자가 바꿀 수 있다. */
export const GOAL_ADJUST_START: Record<Goal, number> = { lose: -20, keep: 0, gain: 10, bulk: 20 };
export const GOAL_ADJUST_MIN = -35;
export const GOAL_ADJUST_MAX = 35;
/** 운동 중심 단백질 시작값(g/kg) */
export const PROTEIN_PER_KG_START: Record<Goal, number> = { lose: 2.0, keep: 1.6, gain: 1.8, bulk: 1.8 };
export const BALANCED_START: Ratio = [55, 20, 25];
export const TRAINING_FAT_PCT_START = 25;
/** 직접 설정 비율 프리셋 (탄:단:지). 3:4:3 은 기본 추천에서 뺐다. */
export const RATIO_PRESETS: { key: 'r532' | 'r433'; ratio: Ratio }[] = [
  { key: 'r532', ratio: [50, 30, 20] },
  { key: 'r433', ratio: [40, 30, 30] },
];
/** 고급 탄수 제한 시작값 — 보편 표준이 아니다. 참고: ADA 2019 저탄수 26–45%, 초저탄수 <26% 또는 비섬유 탄수 20–50g/일 */
export const CARB_LIMIT_START = {
  lowCarb: { by: 'pct', value: 40 },
  lchf: { by: 'pct', value: 20 },
  keto: { by: 'grams', value: 50 },
} as const;

export function defaultPlan(mode: PlanMode, goal: Goal, kcal: number): Plan {
  if (mode === 'balanced') return { mode, ratio: [...BALANCED_START], carb: { kind: 'none' } };
  if (mode === 'training')
    return { mode, proteinPerKg: PROTEIN_PER_KG_START[goal], fatPct: TRAINING_FAT_PCT_START, carb: { kind: 'none' } };
  return { mode, custom: { kind: 'ratio', kcal, ratio: [...RATIO_PRESETS[0].ratio] } };
}

export function defaultNutrition(goal: Goal): NutritionSettings {
  return {
    formula: FORMULA_VERSION,
    policy: POLICY_VERSION,
    goalAdjustPct: null,
    plan: defaultPlan('balanced', goal, 0),
    eligibility: { pregnant: false, lactating: false, medicalDiet: false },
    appliedOn: null,
  };
}

// ── 계산 ──────────────────────────────────────────────────

export interface BodyInput {
  sex: Sex | null;
  age: number | null;
  heightCm: number;
  weightKg: number;
  activity: Activity | null;
}

export interface CompleteBody {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
}

/** 성인 EER (kcal/일, 반올림 없음). 키는 cm 로 받아 m 로 바꿔 넣는다. */
export function eer(b: CompleteBody): number {
  const m = b.heightCm / 100;
  const pa = PA[b.sex][b.activity];
  if (b.sex === 'male') return 662 - 9.53 * b.age + pa * (15.91 * b.weightKg + 539.6 * m);
  return 354 - 6.91 * b.age + pa * (9.36 * b.weightKg + 726 * m);
}

export type AutoBlock = 'missingSex' | 'missingAge' | 'missingActivity' | 'minor' | 'special';

/** 일반 자동 계산(EER)을 못 쓰는 이유들. 빈 배열이면 쓸 수 있다. */
export function autoBlocks(b: BodyInput, el: Eligibility): AutoBlock[] {
  const out: AutoBlock[] = [];
  if (!b.sex) out.push('missingSex');
  if (b.age === null) out.push('missingAge');
  else if (b.age < ADULT_AGE) out.push('minor');
  if (!b.activity) out.push('missingActivity');
  if (el.pregnant || el.lactating || el.medicalDiet) out.push('special');
  return out;
}

export const goalAdjust = (n: Pick<NutritionSettings, 'goalAdjustPct'>, goal: Goal) =>
  n.goalAdjustPct ?? GOAL_ADJUST_START[goal];

/** 50kcal 단위 반올림 — 목표 조정 뒤 한 번만 쓴다. */
export const round50 = (kcal: number) => Math.round(kcal / 50) * 50;

export type CalcError = 'autoBlocked' | 'ratioSum' | 'negativeRemainder' | 'belowMin' | 'invalidInput' | 'carbOverKcal';

export interface Calc {
  /** 유지 칼로리 추정(EER), 반올림 없음. 직접 설정에서 신체 정보가 없으면 null */
  maintenance: number | null;
  /** 조정률을 적용한 값(반올림 전) */
  adjusted: number | null;
  /** 최종 목표 kcal 과 g (반올림 없음) */
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  /** 총열량 대비 % (반올림 없음) */
  percent: Ratio;
  proteinPerKg: number;
}

export type CalcResult = { ok: true; calc: Calc } | { ok: false; error: CalcError; calc: Partial<Calc> };

const finite = (...xs: number[]) => xs.every((x) => Number.isFinite(x) && x >= 0);
const ratioOk = (r: Ratio) => finite(...r) && Math.abs(r[0] + r[1] + r[2] - 100) < 1e-9;

function percentOf(kcal: number, c: number, p: number, f: number): Ratio {
  if (kcal <= 0) return [0, 0, 0];
  return [(c * 400) / kcal, (p * 400) / kcal, (f * 900) / kcal];
}

/** 탄수 제한이 있으면 그 탄수 g, 없으면 null */
function limitedCarbs(carb: CarbLimit, kcal: number): number | null {
  if (carb.kind === 'none') return null;
  return carb.by === 'pct' ? (kcal * carb.value) / 100 / 4 : carb.value;
}

export interface CalcInput {
  goal: Goal;
  body: BodyInput;
  nutrition: Pick<NutritionSettings, 'goalAdjustPct' | 'plan' | 'eligibility'>;
}

export function calculate({ goal, body, nutrition }: CalcInput): CalcResult {
  const { plan } = nutrition;
  const blocks = autoBlocks(body, nutrition.eligibility);
  const maintenance =
    blocks.length === 0
      ? eer({
          sex: body.sex!,
          age: body.age!,
          heightCm: body.heightCm,
          weightKg: body.weightKg,
          activity: body.activity!,
        })
      : null;
  const ppk = (p: number) => (body.weightKg > 0 ? p / body.weightKg : 0);
  const done = (kcal: number, c: number, p: number, f: number, adjusted: number | null): CalcResult => {
    const calc: Calc = {
      maintenance,
      adjusted,
      kcal,
      carbs: c,
      protein: p,
      fat: f,
      percent: percentOf(kcal, c, p, f),
      proteinPerKg: ppk(p),
    };
    if (kcal < MIN_KCAL) return { ok: false, error: 'belowMin', calc };
    return { ok: true, calc };
  };

  if (plan.mode === 'custom') {
    const cu = plan.custom;
    if (cu.kind === 'ratio') {
      if (!finite(cu.kcal) || cu.kcal <= 0) return { ok: false, error: 'invalidInput', calc: { maintenance } };
      if (!ratioOk(cu.ratio)) return { ok: false, error: 'ratioSum', calc: { maintenance } };
      const [c, p, f] = cu.ratio;
      return done(cu.kcal, (cu.kcal * c) / 100 / 4, (cu.kcal * p) / 100 / 4, (cu.kcal * f) / 100 / 9, null);
    }
    if (cu.kind === 'grams') {
      const { carbs, protein, fat } = cu.grams;
      if (!finite(carbs, protein, fat)) return { ok: false, error: 'invalidInput', calc: { maintenance } };
      return done(carbs * 4 + protein * 4 + fat * 9, carbs, protein, fat, null);
    }
    // fixKcal: 고정한 두 영양소를 빼고 남은 칼로리로 나머지 하나를 계산
    const fixed = MACROS.filter((m) => m !== cu.solve);
    if (!finite(cu.kcal, ...fixed.map((m) => cu.grams[m])) || cu.kcal <= 0)
      return { ok: false, error: 'invalidInput', calc: { maintenance } };
    const rest = cu.kcal - fixed.reduce((s, m) => s + cu.grams[m] * KCAL_PER_G[m], 0);
    const g = { ...cu.grams, [cu.solve]: rest / KCAL_PER_G[cu.solve] };
    if (rest < 0)
      return { ok: false, error: 'negativeRemainder', calc: { maintenance, kcal: cu.kcal, [cu.solve]: g[cu.solve] } };
    return done(cu.kcal, g.carbs, g.protein, g.fat, null);
  }

  // 일반 균형 · 운동 중심: 유지 칼로리 × (1 + 조정률) → 50kcal 반올림 한 번 → 그 kcal 로 배분
  if (maintenance === null) return { ok: false, error: 'autoBlocked', calc: {} };
  const adj = goalAdjust(nutrition, goal);
  if (!Number.isFinite(adj) || adj < GOAL_ADJUST_MIN || adj > GOAL_ADJUST_MAX)
    return { ok: false, error: 'invalidInput', calc: { maintenance } };
  const adjusted = maintenance * (1 + adj / 100);
  const kcal = round50(adjusted);
  if (kcal < MIN_KCAL) return { ok: false, error: 'belowMin', calc: { maintenance, adjusted, kcal } };
  const carbFixed = limitedCarbs(plan.carb, kcal);
  if (carbFixed !== null && (!finite(carbFixed) || carbFixed * 4 > kcal))
    return {
      ok: false,
      error: carbFixed * 4 > kcal ? 'carbOverKcal' : 'invalidInput',
      calc: { maintenance, adjusted, kcal },
    };

  if (plan.mode === 'balanced') {
    if (!ratioOk(plan.ratio)) return { ok: false, error: 'ratioSum', calc: { maintenance, adjusted, kcal } };
    const [c, p, f] = plan.ratio;
    const protein = (kcal * p) / 100 / 4;
    if (carbFixed === null) return done(kcal, (kcal * c) / 100 / 4, protein, (kcal * f) / 100 / 9, adjusted);
    const rest = kcal - carbFixed * 4 - protein * 4;
    if (rest < 0)
      return { ok: false, error: 'negativeRemainder', calc: { maintenance, adjusted, kcal, fat: rest / 9 } };
    return done(kcal, carbFixed, protein, rest / 9, adjusted);
  }

  // 운동 중심: 단백질 = 체중 × g/kg 먼저, 지방 시작값 % (또는 탄수 제한이면 탄수 고정), 나머지
  if (!finite(plan.proteinPerKg, plan.fatPct) || plan.fatPct > 100)
    return { ok: false, error: 'invalidInput', calc: { maintenance, adjusted, kcal } };
  const g = splitTraining(kcal, body.weightKg, plan.proteinPerKg, plan.fatPct, carbFixed);
  if (g.carbs < 0 || g.fat < 0)
    return { ok: false, error: 'negativeRemainder', calc: { maintenance, adjusted, kcal, ...g } };
  return done(kcal, g.carbs, g.protein, g.fat, adjusted);
}

/**
 * 운동 중심 배분(반올림 없음). 단백질 = 체중 × g/kg.
 * 탄수 제한이 없으면 지방 = 총열량 × 지방% , 탄수 = 나머지. 탄수 g 이 정해졌으면 지방 = 나머지.
 * 나머지가 음수면 음수 그대로 돌려준다(호출한 쪽이 오류로 처리).
 */
export function splitTraining(
  kcal: number,
  weightKg: number,
  proteinPerKg: number,
  fatPct: number,
  carbs: number | null,
) {
  const protein = weightKg * proteinPerKg;
  if (carbs === null) {
    const fat = (kcal * fatPct) / 100 / 9;
    return { carbs: (kcal - protein * 4 - fat * 9) / 4, protein, fat };
  }
  return { carbs, protein, fat: (kcal - carbs * 4 - protein * 4) / 9 };
}

/** 적용할 목표: 정수로 반올림해 저장한다(화면과 서버가 쓰는 값). */
export function toTargets(c: Calc): Targets {
  return {
    kcal: Math.round(c.kcal),
    carbs: Math.round(c.carbs),
    protein: Math.round(c.protein),
    fat: Math.round(c.fat),
  };
}

/** 참고 범위(AMDR) 밖인 영양소. 저장은 막지 않고 안내만 한다. */
export function outsideAmdr(percent: Ratio): Macro[] {
  return MACROS.filter((k, i) => percent[i] < AMDR[k][0] - 1e-9 || percent[i] > AMDR[k][1] + 1e-9);
}

/** 저장된 목표(정수 g)의 총열량 대비 % */
export function targetPercent(t: Targets): Ratio {
  return percentOf(t.kcal, t.carbs, t.protein, t.fat);
}

// ── 음식 선택 방식 ─────────────────────────────────────────
// 영양 목표와 따로 저장하는 선호. 지금은 저장만 하고 음식 추천·성분 판별에는 쓰지 않는다.

export type FoodPattern = 'general' | 'vegetarian' | 'vegan' | 'mediterranean' | 'carnivore';

export interface FoodStyle {
  pattern: FoodPattern;
  /** 채식에서 달걀·유제품 허용 여부. 비건은 둘 다 false 로 본다. */
  eggs: boolean;
  dairy: boolean;
}

export const defaultFoodStyle = (): FoodStyle => ({ pattern: 'general', eggs: true, dairy: true });

export const ALLERGY_MAX = 10;
export const ALLERGY_LEN = 30;

/** 알레르기는 음식 선호와 다른 값이다. 빈 칸·중복을 지우고 길이를 자른다. */
export function cleanAllergies(xs: string[]): string[] {
  const out: string[] = [];
  for (const x of xs) {
    const v = x.trim().slice(0, ALLERGY_LEN);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, ALLERGY_MAX);
}

// ── 간헐적 단식(구조만) ─────────────────────────────────────
// 탄단지와 상관없는 식사 시간 규칙. 이번에는 저장 구조와 끼니 마감과의 충돌 검사만 둔다(타이머 없음).

export interface FastingWindow {
  /** 먹는 시간 시작·끝 (HH:mm). 끝이 시작보다 이르면 자정을 넘긴다. */
  eatFrom: string;
  eatTo: string;
}

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 먹는 시간 밖에 있는 끼니 마감 번호들. 단식 설정이 없으면 빈 배열. */
export function fastingConflicts(meals: { index: number; deadline: string }[], w: FastingWindow | null): number[] {
  if (!w) return [];
  const a = mins(w.eatFrom);
  const b = mins(w.eatTo);
  const inside = (t: number) => (a <= b ? t >= a && t <= b : t >= a || t <= b);
  return meals.filter((m) => !inside(mins(m.deadline))).map((m) => m.index);
}
