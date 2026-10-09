import { calculate, toTargets } from '../../domain/nutrition';
import { initialSettings } from '../settings/defaults';
import {
  appliedSettings,
  calcInputOf,
  formFromSettings,
  planOf,
  switchCarb,
  switchCustomKind,
  switchMode,
  type NutritionForm,
} from './form';

jest.mock('../../db/client', () => ({}));

const base = (): NutritionForm => ({
  ...formFromSettings({ ...initialSettings(), targets: { kcal: 2400, carbs: 300, protein: 120, fat: 80 } }),
  sex: 'male',
  age: '40',
  height: '172',
  weight: '70',
  activity: 'low',
});

describe('모드 전환: 이전 모드의 숨은 제약이 남지 않는다', () => {
  it('운동 중심 + 케토 → 직접 설정 → 운동 중심으로 돌아와도 케토가 꺼져 있다', () => {
    let f = switchCarb(switchMode(base(), 'training', 0), 'keto');
    expect(planOf(f)).toMatchObject({ mode: 'training', carb: { kind: 'keto', value: 50 } });
    f = switchMode(f, 'custom', 2000);
    expect(planOf(f)).toMatchObject({ mode: 'custom' });
    f = switchMode(f, 'training', 0);
    expect(planOf(f)).toMatchObject({ mode: 'training', carb: { kind: 'none' } });
  });

  it('직접 설정의 g 입력 방식을 바꾸면 g 칸을 비운다(kcal 은 남긴다)', () => {
    let f = switchCustomKind(switchMode(base(), 'custom', 2000), 'fixKcal');
    f = { ...f, custom: { ...f.custom, grams: { carbs: '200', protein: '150', fat: '90' } } };
    const g = switchCustomKind(f, 'grams');
    expect(g.custom.grams).toEqual({ carbs: '', protein: '', fat: '' });
    expect(g.custom.kcal).toBe('2000');
  });

  it('kcal + 2개 고정: 계산할 칸에 남은 예전 값은 저장·계산에 쓰지 않는다', () => {
    let f = switchCustomKind(switchMode(base(), 'custom', 2000), 'fixKcal');
    f = {
      ...f,
      custom: { ...f.custom, kcal: '2000', solve: 'fat', grams: { carbs: '200', protein: '150', fat: '999' } },
    };
    expect(planOf(f)).toEqual({
      mode: 'custom',
      custom: { kind: 'fixKcal', kcal: 2000, solve: 'fat', grams: { carbs: 200, protein: 150, fat: 0 } },
    });
    const r = calculate(calcInputOf(f));
    expect(r.ok && r.calc.fat).toBeCloseTo(66.666667, 5);
  });

  it('빈 칸은 0 으로 보지 않고 오류', () => {
    const f = switchMode(base(), 'training', 0);
    expect(calculate(calcInputOf({ ...f, training: { ...f.training, ppk: '' } }))).toMatchObject({
      ok: false,
      error: 'invalidInput',
    });
  });
});

describe('적용', () => {
  const st = { ...initialSettings(), targets: { kcal: 2400, carbs: 300, protein: 120, fat: 80 } };

  it('적용하기 전에는 설정을 바꾸지 않고, 적용하면 원본 입력·최종 목표·이력을 함께 남긴다', () => {
    const f = base();
    const r = calculate(calcInputOf(f));
    if (!r.ok) throw new Error(r.error);
    const next = appliedSettings(st, f, toTargets(r.calc), '2026-10-10');
    expect(st.targets.kcal).toBe(2400); // 원래 설정은 그대로
    expect(next.targets).toEqual({ kcal: 2550, carbs: 351, protein: 128, fat: 71 });
    expect(next.sex).toBe('male');
    expect(next.age).toBe(40);
    expect(next.nutrition).toMatchObject({
      formula: 'kdri2025-eer-adult',
      policy: 'fitdoing-2026.10',
      goalAdjustPct: null,
      plan: { mode: 'balanced', ratio: [55, 20, 25] },
      appliedOn: '2026-10-10',
    });
    expect(next.targetHistory).toEqual([
      { from: '2000-01-01', kcal: 2400, carbs: 300, protein: 120, fat: 80 },
      { from: '2026-10-10', kcal: 2550, carbs: 351, protein: 128, fat: 71 },
    ]);
  });

  it('저장된 입력으로 다시 열면 같은 모드·값으로 시작한다', () => {
    const f = switchMode(base(), 'training', 0);
    const r = calculate(calcInputOf(f));
    if (!r.ok) throw new Error(r.error);
    const next = appliedSettings(st, f, toTargets(r.calc), '2026-10-10');
    const again = formFromSettings(next);
    expect(again.mode).toBe('training');
    expect(planOf(again)).toEqual(planOf(f));
  });

  it('성별·나이를 모르는 예전 사용자는 비워 둔 채로 시작한다', () => {
    const f = formFromSettings(initialSettings());
    expect(f.sex).toBeNull();
    expect(f.age).toBe('');
    expect(f.activity).toBeNull();
  });
});
