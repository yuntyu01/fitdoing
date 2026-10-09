import { create } from 'zustand';

// 네이티브 잠금 화면의 "비상 해제"(fitdoing://emergency)로 들어왔다는 표시.
// 잠금 중에는 컨트롤러가 앱 잠금 화면으로 데려가므로, 그 화면이 이 표시를 보고 비상 해제 화면을 바로 연다.
export const useEmergencyIntent = create<{ pending: boolean }>(() => ({ pending: false }));

export const requestEmergencyView = () => useEmergencyIntent.setState({ pending: true });
export const clearEmergencyIntent = () => useEmergencyIntent.setState({ pending: false });
