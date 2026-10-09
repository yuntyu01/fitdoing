import { router } from 'expo-router';

import { dateKey } from '../../domain/time';
import { appliedSettings, useNutritionForm } from '../nutrition/form';
import type { Flow, StepNo } from '../nutrition/routes';
import { useOnboardingDraft } from './draft';

/** 온보딩 전체 단계 수: 신체·목표 · 활동 · 계산 모드 · 결과 · 끼니 · 운동·수면 · 확인 */
export const ONBOARDING_STEPS = 7;

export const onboardingFlow: Flow = {
  kind: 'onboarding',
  step: (i: StepNo) => ({ step: i, total: ONBOARDING_STEPS }),
  next: { activity: '/onboarding/activity', plan: '/onboarding/plan', result: '/onboarding/result' },
  before: null,
  apply: (targets) => {
    const f = useNutritionForm.getState().form;
    if (!f) return;
    const draft = useOnboardingDraft.getState();
    draft.setAll(appliedSettings(draft.settings, f, targets, dateKey(new Date())));
    router.push('/onboarding/meals');
  },
};
