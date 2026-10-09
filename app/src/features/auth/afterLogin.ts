import { db } from '../../db/client';
import { settings as settingsTable } from '../../db/schema';
import { decideAfterLogin, type Provider } from '../../domain/auth';
import type { Snapshot } from '../../domain/restore';
import { fetchSnapshot, loginToServer } from '../api/client';
import { writeMeta } from '../api/store';
import { restoreFromSnapshot, wipeLocalData } from './restore';
import { setOwnerId, setSession, useSession } from './session';

/**
 * 제공자 토큰으로 서버에 로그인하고, 폰 데이터를 어떻게 할지 정한 뒤(domain/auth.ts) 세션을 연다.
 * 세션은 마지막에 연다: 그 전에 열면 복원 중인 폰이 잠깐 온보딩으로 보이고, 서버 설정을 새 온보딩 값이 덮어쓸 수 있다.
 * 서버·DB 오류는 던진다(세션은 열리지 않고 로그인 화면에 남는다).
 */
export async function finishLogin(provider: Provider, providerToken: string): Promise<void> {
  const { token, userId } = await loginToServer(provider, providerToken);

  const ownerId = useSession.getState().ownerId;
  const hasLocalSettings = db.select().from(settingsTable).get() != null;

  let snapshot: Snapshot | null = null;
  let action = decideAfterLogin({ ownerId, userId, hasLocalSettings });
  if (action === 'need-snapshot') {
    snapshot = await fetchSnapshot(token);
    action = decideAfterLogin({ ownerId, userId, hasLocalSettings, serverHasSettings: snapshot.settings != null });
  }

  if (action === 'restore' && snapshot) {
    await restoreFromSnapshot(snapshot);
  } else if (action === 'reset') {
    await wipeLocalData();
  } else if (action === 'push') {
    writeMeta({ initialDone: false }); // startSync 가 폰의 기록 전체를 새 계정으로 올린다
  }

  await setOwnerId(userId);
  await setSession(token, userId);
}
