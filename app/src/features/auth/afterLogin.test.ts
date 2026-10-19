import { fetchSnapshot, loginToServer } from '../api/client';
import { writeMeta } from '../api/store';
import { finishLogin } from './afterLogin';
import { restoreFromSnapshot, wipeLocalData } from './restore';
import { clearDeviceToken, setOwnerId, setSession } from './session';

jest.mock('../../db/client', () => ({ db: { select: () => ({ from: () => ({ get: () => ({ id: 1 }) }) }) } }));
jest.mock('../../db/schema', () => ({ settings: {} }));
jest.mock('../api/client', () => ({ fetchSnapshot: jest.fn(), loginToServer: jest.fn() }));
jest.mock('../api/store', () => ({ writeMeta: jest.fn() }));
jest.mock('./restore', () => ({ restoreFromSnapshot: jest.fn(), wipeLocalData: jest.fn() }));
jest.mock('./session', () => ({
  existingDeviceToken: jest.fn(async () => 'device-test-installation-proof'),
  clearDeviceToken: jest.fn(), setOwnerId: jest.fn(), setSession: jest.fn(),
  useSession: { getState: () => ({ ownerId: null }) },
}));


beforeEach(() => jest.clearAllMocks());

it('keeps local test records and uploads them after verified device upgrade', async () => {
  jest.mocked(loginToServer).mockResolvedValue({ token: 'signed-session', userId: 'upgraded-user', isNew: false });
  await finishLogin('google', 'provider-proof');
  expect(loginToServer).toHaveBeenCalledWith('google', 'provider-proof', 'device-test-installation-proof');
  expect(writeMeta).toHaveBeenCalledWith({ initialDone: false });
  expect(setOwnerId).toHaveBeenCalledWith('upgraded-user');
  expect(setSession).toHaveBeenCalledWith('signed-session', 'upgraded-user');
  expect(clearDeviceToken).toHaveBeenCalledTimes(1);
  expect(fetchSnapshot).not.toHaveBeenCalled();
  expect(wipeLocalData).not.toHaveBeenCalled();
  expect(restoreFromSnapshot).not.toHaveBeenCalled();
});

it('leaves records, owner and installation proof intact on account conflict', async () => {
  jest.mocked(loginToServer).mockRejectedValue(new Error('ACCOUNT_LINK_CONFLICT'));
  await expect(finishLogin('kakao', 'provider-proof')).rejects.toThrow('ACCOUNT_LINK_CONFLICT');
  expect(writeMeta).not.toHaveBeenCalled();
  expect(setOwnerId).not.toHaveBeenCalled();
  expect(setSession).not.toHaveBeenCalled();
  expect(clearDeviceToken).not.toHaveBeenCalled();
  expect(wipeLocalData).not.toHaveBeenCalled();
  expect(restoreFromSnapshot).not.toHaveBeenCalled();
});

