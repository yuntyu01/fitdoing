import {
  ACTIVITIES,
  cleanAllergies,
  defaultFoodStyle,
  MACROS,
  type Activity,
  type ActivityInput,
  type CarbLimit,
  type CustomPlan,
  type DailyActivity,
  type ExerciseType,
  type FastingWindow,
  type FoodPattern,
  type FoodStyle,
  type Intensity,
  type Macro,
  type NutritionSettings,
  type Plan,
  type Ratio,
  type Sex,
} from './nutrition';
import { HISTORY_MAX, type TargetEntry } from './targets';

// 서버·예전 로컬 JSON → 신체 정보와 영양 계산 입력. 모양이 틀리면 그 부분만 '모름'(null·빈 값)으로 둔다.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const numOr = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const SEXES: Sex[] = ['male', 'female'];
const DAILY: DailyActivity[] = ['sitting', 'standing', 'walking', 'manual'];
const EXERCISE: ExerciseType[] = ['none', 'strength', 'cardio', 'mixed', 'sports'];
const INTENSITY: Intensity[] = ['light', 'moderate', 'vigorous'];
const PATTERNS: FoodPattern[] = ['general', 'vegetarian', 'vegan', 'mediterranean', 'carnivore'];

function ratio(v: unknown): Ratio | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const r = v.map(numOr);
  return r.every((x) => x !== null) ? (r as Ratio) : null;
}

function grams(v: unknown): Record<Macro, number> | null {
  if (!isObj(v)) return null;
  const out = {} as Record<Macro, number>;
  for (const m of MACROS) {
    const n = numOr(v[m]);
    if (n === null) return null;
    out[m] = n;
  }
  return out;
}

function carbLimit(v: unknown): CarbLimit {
  if (!isObj(v)) return { kind: 'none' };
  const value = numOr(v.value);
  if (v.kind === 'keto' && value !== null) return { kind: 'keto', by: 'grams', value };
  if ((v.kind === 'lowCarb' || v.kind === 'lchf') && value !== null) {
    const by = oneOf(v.by, ['pct', 'grams'] as const);
    if (by) return { kind: v.kind, by, value };
  }
  return { kind: 'none' };
}

function custom(v: unknown): CustomPlan | null {
  if (!isObj(v)) return null;
  if (v.kind === 'ratio') {
    const kcal = numOr(v.kcal);
    const r = ratio(v.ratio);
    return kcal !== null && r ? { kind: 'ratio', kcal, ratio: r } : null;
  }
  if (v.kind === 'fixKcal') {
    const kcal = numOr(v.kcal);
    const solve = oneOf(v.solve, MACROS);
    const g = grams(v.grams);
    return kcal !== null && solve && g ? { kind: 'fixKcal', kcal, solve, grams: g } : null;
  }
  if (v.kind === 'grams') {
    const g = grams(v.grams);
    return g ? { kind: 'grams', grams: g } : null;
  }
  return null;
}

function plan(v: unknown): Plan | null {
  if (!isObj(v)) return null;
  if (v.mode === 'balanced') {
    const r = ratio(v.ratio);
    return r ? { mode: 'balanced', ratio: r, carb: carbLimit(v.carb) } : null;
  }
  if (v.mode === 'training') {
    const ppk = numOr(v.proteinPerKg);
    const fat = numOr(v.fatPct);
    return ppk !== null && fat !== null
      ? { mode: 'training', proteinPerKg: ppk, fatPct: fat, carb: carbLimit(v.carb) }
      : null;
  }
  if (v.mode === 'custom') {
    const c = custom(v.custom);
    return c ? { mode: 'custom', custom: c } : null;
  }
  return null;
}

export function parseNutrition(v: unknown): NutritionSettings | null {
  if (!isObj(v)) return null;
  const p = plan(v.plan);
  if (!p) return null;
  const el: Obj = isObj(v.eligibility) ? v.eligibility : {};
  return {
    formula: typeof v.formula === 'string' ? v.formula : '',
    policy: typeof v.policy === 'string' ? v.policy : '',
    goalAdjustPct: numOr(v.goalAdjustPct),
    plan: p,
    eligibility: {
      pregnant: el.pregnant === true,
      lactating: el.lactating === true,
      medicalDiet: el.medicalDiet === true,
    },
    appliedOn: typeof v.appliedOn === 'string' && DATE.test(v.appliedOn) ? v.appliedOn : null,
  };
}

function activityInput(v: unknown): ActivityInput | null {
  if (!isObj(v)) return null;
  const e: Obj = isObj(v.exercise) ? v.exercise : {};
  return {
    daily: oneOf(v.daily, DAILY),
    exercise: {
      type: oneOf(e.type, EXERCISE) ?? 'none',
      perWeek: Math.max(0, Math.min(14, numOr(e.perWeek) ?? 0)),
      minutes: Math.max(0, Math.min(600, numOr(e.minutes) ?? 0)),
      intensity: oneOf(e.intensity, INTENSITY),
    },
  };
}

function history(v: unknown): TargetEntry[] {
  if (!Array.isArray(v)) return [];
  const out: TargetEntry[] = [];
  for (const e of v) {
    if (!isObj(e) || typeof e.from !== 'string' || !DATE.test(e.from)) continue;
    const [kcal, carbs, protein, fat] = [e.kcal, e.carbs, e.protein, e.fat].map(numOr);
    if (kcal === null || carbs === null || protein === null || fat === null) continue;
    if (out.some((x) => x.from === e.from)) continue;
    out.push({ from: e.from, kcal, carbs, protein, fat });
  }
  out.sort((a, b) => (a.from < b.from ? -1 : 1));
  return out.slice(-HISTORY_MAX);
}

function foodStyle(v: unknown): FoodStyle {
  if (!isObj(v)) return defaultFoodStyle();
  const pattern = oneOf(v.pattern, PATTERNS) ?? 'general';
  if (pattern === 'vegan') return { pattern, eggs: false, dairy: false };
  return { pattern, eggs: v.eggs !== false, dairy: v.dairy !== false };
}

function fasting(v: unknown): FastingWindow | null {
  if (!isObj(v) || typeof v.eatFrom !== 'string' || typeof v.eatTo !== 'string') return null;
  return HHMM.test(v.eatFrom) && HHMM.test(v.eatTo) ? { eatFrom: v.eatFrom, eatTo: v.eatTo } : null;
}

export function parseNutritionFields(b: Obj) {
  const age = numOr(b.age);
  return {
    sex: oneOf(b.sex, SEXES),
    age: age !== null && age > 0 ? age : null,
    activity: oneOf(b.activity, ACTIVITIES) as Activity | null,
    activityInput: activityInput(b.activityInput),
    nutrition: parseNutrition(b.nutrition),
    targetHistory: history(b.targetHistory),
    foodStyle: foodStyle(b.foodStyle),
    allergies: Array.isArray(b.allergies)
      ? cleanAllergies(b.allergies.filter((a): a is string => typeof a === 'string'))
      : [],
    fasting: fasting(b.fasting),
  };
}
