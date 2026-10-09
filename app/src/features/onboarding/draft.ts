import { create } from 'zustand';

import type { Settings } from '../../db/schema';
import { initialSettings } from '../settings/defaults';
import { cleanNickname } from '../settings/editors/ProfileEditor';

// 온보딩에서 모으는 설정. 신체·목표·활동·영양 목표는 features/nutrition/form 의 입력 상태로 받고,
// 결과 확인 단계에서 적용(appliedSettings)한 값이 여기 settings 에 들어온다.

interface DraftState {
  settings: Settings;
  set: (patch: Partial<Settings>) => void;
  setAll: (next: Settings) => void;
  finalize: () => Settings;
}

export const useOnboardingDraft = create<DraftState>((set, get) => ({
  settings: initialSettings(),
  set: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setAll: (settings) => set({ settings }),
  finalize: () => ({ ...get().settings, nickname: cleanNickname(get().settings.nickname) }),
}));
