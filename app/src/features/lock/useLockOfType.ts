import { useEffect, useState } from 'react';

import type { ActiveLock, LockType } from '../../domain/lock';
import { useLock } from './store';
import { useTicker } from './useTicker';

/**
 * 잠금 화면용. 해당 종류의 잠금을 돌려주고, 풀리는 순간에도 화면이 깨지지 않도록 마지막 값을 붙들고 있다.
 * 시간이 다 되면 판정을 다시 돌려 화면을 나가게 한다. now는 1초마다 갱신되는 시각(ms).
 */
export function useLockOfType(type: LockType): { lock: ActiveLock | null; now: number } {
  const active = useLock((s) => s.active);
  const [lock, setLock] = useState<ActiveLock | null>(active?.type === type ? active : null);
  if (active?.type === type && active !== lock) setLock(active);
  const now = useTicker(1000);

  useEffect(() => {
    if (lock && now >= lock.until) useLock.getState().refresh();
  }, [now, lock]);

  return { lock, now };
}
