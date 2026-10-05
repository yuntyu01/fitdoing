import { create } from 'zustand';

import type { Settings } from '../../db/schema';
import { defaultTargets } from '../../domain/targets';
import { initialSettings } from '../settings/defaults';
import type { ProfileDraft } from '../settings/editors/ProfileEditor';

interface DraftState {
  settings: Settings;
  profile: ProfileDraft;
  set: (patch: Partial<Settings>) => void;
  setProfile: (p: ProfileDraft) => void;
  /** 입력한 목표·몸무게로 기본 목표 칼로리를 채운 최종 설정 */
  finalize: () => Settings;
}

const init = initialSettings();

export const useOnboardingDraft = create<DraftState>((set, get) => ({
  settings: init,
  profile: { goal: init.goal, height: String(init.heightCm), weight: String(init.weightKg) },
  set: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setProfile: (profile) => set({ profile }),
  finalize: () => {
    const { settings, profile } = get();
    const heightCm = Number(profile.height);
    const weightKg = Number(profile.weight);
    return {
      ...settings,
      goal: profile.goal,
      heightCm,
      weightKg,
      targets: defaultTargets(profile.goal, weightKg),
    };
  },
}));
