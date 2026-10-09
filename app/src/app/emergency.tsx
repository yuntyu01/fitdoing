import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';

import { releaseMethods } from '../domain/lock';
import { EmergencyView } from '../features/lock/components/EmergencyView';
import { requestEmergencyView } from '../features/lock/components/emergencyIntent';
import { useLock } from '../features/lock/store';
import { useSettings } from '../features/settings/store';

/**
 * 네이티브 잠금 화면의 "비상 해제"(fitdoing://emergency)가 들어오는 곳.
 * 잠금 중이면 전처럼 홈으로 보내고(컨트롤러가 잠금 화면을 띄운다), 비상 해제가 되는 잠금이면 그 화면이 비상 해제를 바로 연다.
 * 걸린 잠금이 없으면 빈 상태를 보여 준다.
 */
export default function Emergency() {
  const active = useLock((s) => s.active);
  const mode = useSettings((s) => s.settings?.mode ?? 'normal');
  const allowed = !!active && releaseMethods(active.type, mode).includes('emergency');

  useEffect(() => {
    if (allowed) requestEmergencyView();
  }, [allowed]);

  if (active) return <Redirect href="/" />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return <EmergencyView lock={null} onClose={close} />;
}
