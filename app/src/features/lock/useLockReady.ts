import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { Settings } from '../../db/schema';
import { getLockEngine } from './engine';

/**
 * 마감을 놓치면 실제로 앱이 잠기는지: 순한맛이 아니고, 잠금 엔진이 다른 앱을 막을 권한을 가졌을 때만 true.
 * 권한은 설정 앱에서 바뀔 수 있어서 앱이 다시 앞으로 올 때마다 다시 읽는다.
 */
export function useLockReady(settings: Settings): boolean {
  const [canLock, setCanLock] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => {
      const engine = getLockEngine();
      (engine.canLock ? engine.canLock() : Promise.resolve(false))
        .then((v) => alive && setCanLock(v))
        .catch(() => alive && setCanLock(false));
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return settings.mode !== 'mild' && canLock;
}
