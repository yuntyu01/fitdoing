import { create } from 'zustand';

import type { Settings } from '../../db/schema';
import {
  BALANCED_START,
  CARB_LIMIT_START,
  defaultNutrition,
  emptyActivityInput,
  FORMULA_VERSION,
  GOAL_ADJUST_START,
  POLICY_VERSION,
  PROTEIN_PER_KG_START,
  RATIO_PRESETS,
  TRAINING_FAT_PCT_START,
  type Activity,
  type ActivityInput,
  type BodyInput,
  type CalcInput,
  type CarbLimit,
  type Eligibility,
  type Macro,
  type NutritionSettings,
  type Plan,
  type PlanMode,
  type Sex,
} from '../../domain/nutrition';
import { recordTargets, type Goal, type Targets } from '../../domain/targets';

// 영양 목표 단계 화면(신체·목표 → 활동 → 계산 모드 → 결과)이 같이 쓰는 입력 상태.
// 숫자 칸은 입력 중인 글자 그대로 들고 있다가 계산할 때 숫자로 바꾼다. 빈 칸·잘못된 값은 NaN → 계산 오류로 보인다.

type Triple = [string, string, string];
export type CarbKind = CarbLimit['kind'];
export type CustomKind = 'ratio' | 'fixKcal' | 'grams';

export interface NutritionForm {
  goal: Goal;
  sex: Sex | null;
  age: string;
  height: string;
  weight: string;
  eligibility: Eligibility;
  activity: Activity | null;
  activityInput: ActivityInput;
  minutes: string;
  mode: PlanMode;
  /** null = 목표별 시작값 */
  goalAdjust: number | null;
  balanced: Triple;
  training: { ppk: string; fatPct: string };
  carb: { kind: CarbKind; by: 'pct' | 'grams'; value: string };
  custom: { kind: CustomKind; kcal: string; ratio: Triple; solve: Macro; grams: Record<Macro, string> };
}

const s = (n: number) => String(Math.round(n * 100) / 100);
const triple = (r: readonly number[]): Triple => [s(r[0]), s(r[1]), s(r[2])];
const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

const emptyCustom = (kcal: number): NutritionForm['custom'] => ({
  kind: 'ratio',
  kcal: kcal > 0 ? s(kcal) : '',
  ratio: triple(RATIO_PRESETS[0].ratio),
  solve: 'carbs',
  grams: { carbs: '', protein: '', fat: '' },
});

/** 모드를 바꿀 때: 새 모드의 칸은 시작값으로, 탄수 제한은 끈다(이전 모드의 숨은 제약이 남지 않게). */
export function switchMode(f: NutritionForm, mode: PlanMode, kcalHint: number): NutritionForm {
  if (f.mode === mode) return f;
  return {
    ...f,
    mode,
    balanced: triple(BALANCED_START),
    training: { ppk: s(PROTEIN_PER_KG_START[f.goal]), fatPct: s(TRAINING_FAT_PCT_START) },
    carb: { kind: 'none', by: 'pct', value: '' },
    custom: emptyCustom(kcalHint),
  };
}

/** 직접 설정 안에서 비율 ↔ g 입력을 바꿀 때도 숫자 칸을 비운다. kcal 은 남긴다. */
export function switchCustomKind(f: NutritionForm, kind: CustomKind): NutritionForm {
  if (f.custom.kind === kind) return f;
  return { ...f, custom: { ...emptyCustom(0), kind, kcal: f.custom.kcal } };
}

export function switchCarb(f: NutritionForm, kind: CarbKind): NutritionForm {
  if (kind === 'none') return { ...f, carb: { kind, by: 'pct', value: '' } };
  const start = CARB_LIMIT_START[kind];
  return { ...f, carb: { kind, by: start.by, value: s(start.value) } };
}

/** 목표를 바꾸면 운동 중심 단백질 시작값도 그 목표 것으로 (직접 고친 값이 시작값과 같을 때만) */
export function switchGoal(f: NutritionForm, goal: Goal): NutritionForm {
  const ppk = num(f.training.ppk) === PROTEIN_PER_KG_START[f.goal] ? s(PROTEIN_PER_KG_START[goal]) : f.training.ppk;
  return { ...f, goal, training: { ...f.training, ppk } };
}

export function formFromSettings(st: Settings): NutritionForm {
  const n = st.nutrition ?? defaultNutrition(st.goal);
  const base: NutritionForm = {
    goal: st.goal,
    sex: st.sex,
    age: st.age === null ? '' : String(st.age),
    height: String(st.heightCm),
    weight: String(st.weightKg),
    eligibility: { ...n.eligibility },
    activity: st.activity,
    activityInput: st.activityInput ? structuredClone(st.activityInput) : emptyActivityInput(),
    minutes: st.activityInput?.exercise.minutes ? String(st.activityInput.exercise.minutes) : '',
    mode: 'balanced',
    goalAdjust: n.goalAdjustPct,
    balanced: triple(BALANCED_START),
    training: { ppk: s(PROTEIN_PER_KG_START[st.goal]), fatPct: s(TRAINING_FAT_PCT_START) },
    carb: { kind: 'none', by: 'pct', value: '' },
    custom: emptyCustom(st.targets.kcal),
  };
  const p = n.plan;
  if (p.mode === 'custom') {
    const c = p.custom;
    const custom = { ...emptyCustom(st.targets.kcal), kind: c.kind };
    if (c.kind === 'ratio') Object.assign(custom, { kcal: s(c.kcal), ratio: triple(c.ratio) });
    if (c.kind === 'fixKcal')
      Object.assign(custom, {
        kcal: s(c.kcal),
        solve: c.solve,
        grams: { carbs: s(c.grams.carbs), protein: s(c.grams.protein), fat: s(c.grams.fat) },
      });
    if (c.kind === 'grams')
      Object.assign(custom, { grams: { carbs: s(c.grams.carbs), protein: s(c.grams.protein), fat: s(c.grams.fat) } });
    return { ...base, mode: 'custom', custom };
  }
  const carb = p.carb.kind === 'none' ? base.carb : { kind: p.carb.kind, by: p.carb.by, value: s(p.carb.value) };
  if (p.mode === 'balanced') return { ...base, mode: 'balanced', balanced: triple(p.ratio), carb };
  return { ...base, mode: 'training', training: { ppk: s(p.proteinPerKg), fatPct: s(p.fatPct) }, carb };
}

export function bodyOf(f: NutritionForm): BodyInput {
  const age = num(f.age);
  return {
    sex: f.sex,
    age: Number.isFinite(age) ? age : null,
    heightCm: num(f.height),
    weightKg: num(f.weight),
    activity: f.activity,
  };
}

export function planOf(f: NutritionForm): Plan {
  const carb: CarbLimit =
    f.carb.kind === 'none'
      ? { kind: 'none' }
      : f.carb.kind === 'keto'
        ? { kind: 'keto', by: 'grams', value: num(f.carb.value) }
        : { kind: f.carb.kind, by: f.carb.by, value: num(f.carb.value) };
  if (f.mode === 'balanced')
    return { mode: 'balanced', ratio: [num(f.balanced[0]), num(f.balanced[1]), num(f.balanced[2])], carb };
  if (f.mode === 'training')
    return { mode: 'training', proteinPerKg: num(f.training.ppk), fatPct: num(f.training.fatPct), carb };
  const c = f.custom;
  const g = { carbs: num(c.grams.carbs), protein: num(c.grams.protein), fat: num(c.grams.fat) };
  if (c.kind === 'ratio')
    return {
      mode: 'custom',
      custom: { kind: 'ratio', kcal: num(c.kcal), ratio: [num(c.ratio[0]), num(c.ratio[1]), num(c.ratio[2])] },
    };
  if (c.kind === 'fixKcal')
    // 계산할 칸의 예전 값은 저장하지 않는다(0)
    return {
      mode: 'custom',
      custom: { kind: 'fixKcal', kcal: num(c.kcal), solve: c.solve, grams: { ...g, [c.solve]: 0 } },
    };
  return { mode: 'custom', custom: { kind: 'grams', grams: g } };
}

export function calcInputOf(f: NutritionForm): CalcInput {
  return {
    goal: f.goal,
    body: bodyOf(f),
    nutrition: { goalAdjustPct: f.goalAdjust, plan: planOf(f), eligibility: f.eligibility },
  };
}

export const goalAdjustOf = (f: NutritionForm) => f.goalAdjust ?? GOAL_ADJUST_START[f.goal];

export function activityInputOf(f: NutritionForm): ActivityInput {
  const m = num(f.minutes);
  return {
    daily: f.activityInput.daily,
    exercise: { ...f.activityInput.exercise, minutes: Number.isFinite(m) ? Math.max(0, Math.min(600, m)) : 0 },
  };
}

/** 적용할 때 저장하는 원본 입력 */
export function nutritionOf(f: NutritionForm, today: string): NutritionSettings {
  return {
    formula: FORMULA_VERSION,
    policy: POLICY_VERSION,
    goalAdjustPct: f.goalAdjust,
    plan: planOf(f),
    eligibility: { ...f.eligibility },
    appliedOn: today,
  };
}

/** 신체·목표 단계를 넘어갈 수 있는지: 키·몸무게는 필수, 나이는 비워도 되지만 넣으면 범위 안 */
export function isBodyValid(f: NutritionForm): boolean {
  const h = num(f.height);
  const w = num(f.weight);
  const ageOk = f.age.trim() === '' || (Number.isInteger(num(f.age)) && num(f.age) >= 10 && num(f.age) <= 100);
  return h >= 100 && h <= 250 && w >= 30 && w <= 300 && ageOk;
}

interface FormState {
  form: NutritionForm | null;
  start: (st: Settings) => void;
  set: (f: NutritionForm) => void;
  patch: (p: Partial<NutritionForm>) => void;
}

export const useNutritionForm = create<FormState>((set, get) => ({
  form: null,
  start: (st) => set({ form: formFromSettings(st) }),
  set: (form) => set({ form }),
  patch: (p) => {
    const f = get().form;
    if (f) set({ form: { ...f, ...p } });
  },
}));

export function useForm(): NutritionForm {
  const f = useNutritionForm((s) => s.form);
  if (!f) throw new Error('nutrition form not started');
  return f;
}

/**
 * 결과 적용: 신체 정보·활동·계산 입력·최종 목표를 한 번에 바꾼다. 목표가 바뀌면 오늘부터 새 목표로 이력에 남긴다.
 * 음식 데이터(끼니 kcal)는 건드리지 않는다.
 */
export function appliedSettings(st: Settings, f: NutritionForm, targets: Targets, today: string): Settings {
  const body = bodyOf(f);
  return {
    ...st,
    goal: f.goal,
    sex: f.sex,
    age: body.age,
    heightCm: body.heightCm,
    weightKg: body.weightKg,
    activity: f.activity,
    activityInput: activityInputOf(f),
    nutrition: nutritionOf(f, today),
    targets,
    targetHistory: recordTargets(st.targetHistory, st.targets, targets, today),
  };
}
