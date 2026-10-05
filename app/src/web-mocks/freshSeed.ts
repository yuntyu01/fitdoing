// 웹 스크린샷 전용: 온보딩 전(fresh) 상태에서 3단계 화면이 시안처럼 채워져 보이게 헬스장 위치를 미리 넣는다.
import { useOnboardingDraft } from '../features/onboarding/draft';
import { seedSettings } from './fakeDb';

if ((globalThis as { __FD_FRESH__?: boolean }).__FD_FRESH__ === true) {
  const { gym } = useOnboardingDraft.getState().settings;
  useOnboardingDraft.getState().set({ gym: { ...gym, name: seedSettings.gym.name, address: seedSettings.gym.address, lat: seedSettings.gym.lat, lng: seedSettings.gym.lng } });
}
