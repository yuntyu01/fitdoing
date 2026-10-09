import { router } from 'expo-router';

import { dateKey } from '../../domain/time';
import { useSettings } from '../settings/store';
import { appliedSettings, useNutritionForm } from './form';
import type { Flow } from './routes';

/** 설정에서 여는 영양 목표 단계. 적용하면 설정 화면으로 돌아간다. */
export function settingsFlow(): Flow {
  const st = useSettings.getState().settings;
  return {
    kind: 'settings',
    step: () => null,
    next: { activity: '/edit/nutrition-activity', plan: '/edit/nutrition-plan', result: '/edit/nutrition-result' },
    before: st ? st.targets : null,
    apply: (targets) => {
      const { settings, save } = useSettings.getState();
      const f = useNutritionForm.getState().form;
      if (!settings || !f) return;
      save(appliedSettings(settings, f, targets, dateKey(new Date())));
      // 입력 상태는 비우지 않는다: 스택에 남은 앞 단계 화면이 닫히기 전에 다시 그려진다. 다음에 1단계를 열 때 새로 만든다.
      router.dismissTo('/settings');
    },
  };
}
