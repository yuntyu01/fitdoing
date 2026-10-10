import { create } from 'zustand';

/** 한 끼니에 찍을 수 있는 사진 수 (서버 ai.MaxPhotos 와 같다) */
export const MAX_PHOTOS = 3;

export interface ShotPhoto {
  uri: string;
  w: number;
  h: number;
}

// 기록 확인 화면에서 "사진 추가"로 카메라를 열면, 찍은 사진을 여기 두고 카메라는 닫힌다.
// 확인 화면이 가져가면서 비운다(take).
interface CaptureDraft {
  added: ShotPhoto[];
  add: (p: ShotPhoto) => void;
  take: () => ShotPhoto[];
}

export const useCaptureDraft = create<CaptureDraft>((set, get) => ({
  added: [],
  add: (p) => set((s) => ({ added: [...s.added, p] })),
  take: () => {
    const out = get().added;
    if (out.length) set({ added: [] });
    return out;
  },
}));
