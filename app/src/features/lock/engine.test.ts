import * as native from '../../../../modules/lock-engine';
import { initialSettings } from '../settings/defaults';
import { getLockEngine, setLockEngineForTest } from './engine';

jest.mock('../../../../modules/lock-engine', () => ({
  isAvailable: true,
  startLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn().mockResolvedValue(true),
  getLockState: jest.fn(),
  setSchedule: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => { jest.clearAllMocks(); setLockEngineForTest(null); });

test('Android lock requests reach the native bridge instead of the memory fallback', async () => {
  const engine = getLockEngine();
  expect(engine.native).toBe(true);
  await engine.startLock('meal', 123456, ['com.android.dialer']);
  expect(native.startLock).toHaveBeenCalledWith('meal', 123456, ['com.android.dialer']);
  await engine.releaseLock('meal', 'emergency');
  expect(native.releaseLock).toHaveBeenCalledWith('meal', 'emergency');
});

test('first schedule skips past deadlines but an existing schedule survives app restart', async () => {
  const state = jest.mocked(native.getLockState);
  state.mockResolvedValue({ locked: false, locks: [], hasSchedule: false });
  await getLockEngine().setSchedule(initialSettings());
  expect(native.setSchedule).toHaveBeenLastCalledWith(expect.any(Object), { ignoreStarted: true });
  state.mockResolvedValue({ locked: false, locks: [], hasSchedule: true });
  await getLockEngine().setSchedule(initialSettings());
  expect(native.setSchedule).toHaveBeenLastCalledWith(expect.any(Object), { ignoreStarted: false });
  await getLockEngine().setSchedule(initialSettings(), true);
  expect(native.setSchedule).toHaveBeenLastCalledWith(expect.any(Object), { ignoreStarted: true });
});
