import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';

import { create } from 'zustand';

import { enqueueAll, removeSent, type QueueItem } from '../../domain/sync';

// 기기 id와 재시도 큐는 앱 문서 디렉터리의 작은 파일로 둔다.
// (잠금·기록의 진실은 로컬 SQLite이고, 이 둘은 서버 백업용 부가 정보라 스키마를 늘리지 않는다.)

const deviceFile = () => new File(Paths.document, 'device-id.txt');
const queueFile = () => new File(Paths.document, 'sync-queue.json');

let cachedId: string | null = null;

/** 최초 1회 uuid를 만들어 보관한다. 계정 없이 기기 단위로 서버 데이터를 나누는 키. */
export async function getDeviceId(): Promise<string> {
  if (cachedId) return cachedId;
  try {
    const f = deviceFile();
    if (f.exists) {
      const v = (await f.text()).trim();
      if (v) return (cachedId = v);
    }
  } catch {
    // 읽기에 실패하면 새로 만든다.
  }
  const id = randomUUID();
  cachedId = id;
  try {
    const f = deviceFile();
    f.create({ overwrite: true });
    f.write(id);
  } catch (e) {
    console.warn('device id save failed', e);
  }
  return id;
}

// 큐는 메모리에 한 벌 두고, 모든 변경을 한 줄로 세워(chain) 동시에 쓰다 잃는 일이 없게 한다.
let cache: QueueItem[] | null = null;
let chain: Promise<unknown> = Promise.resolve();

async function load(): Promise<QueueItem[]> {
  if (cache) return cache;
  try {
    const f = queueFile();
    const data = f.exists ? JSON.parse(await f.text()) : [];
    cache = Array.isArray(data) ? (data as QueueItem[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(queue: QueueItem[]) {
  cache = queue;
  useSyncStatus.setState({ pending: queue.length });
  try {
    const f = queueFile();
    f.create({ overwrite: true });
    f.write(JSON.stringify(queue));
  } catch (e) {
    console.warn('queue save failed', e);
  }
}

function mutate<T>(fn: (q: QueueItem[]) => { queue: QueueItem[]; result: T }): Promise<T> {
  const p = chain.then(async () => {
    const { queue, result } = fn(await load());
    persist(queue);
    return result;
  });
  chain = p.catch(() => {});
  return p;
}

export const readQueue = (): Promise<QueueItem[]> => chain.then(load);

/** 항목을 쌓는다(같은 key는 덮어쓴다). 상한을 넘겨 버린 개수를 돌려준다. */
export const pushItems = (items: QueueItem[]): Promise<number> =>
  mutate((q) => {
    const r = enqueueAll(q, items);
    return { queue: r.queue, result: r.dropped };
  });

export const removeItems = (items: QueueItem[]): Promise<void> => mutate((q) => ({ queue: removeSent(q, items), result: undefined }));

// 동기화 부가 정보(초기 전체 동기화 여부, 마지막 성공 시각)도 작은 파일로.
interface Meta {
  initialDone: boolean;
  lastSyncAt: number | null;
}
const metaFile = () => new File(Paths.document, 'sync-meta.json');
let meta: Meta | null = null;

export function readMeta(): Meta {
  if (meta) return meta;
  try {
    const f = metaFile();
    const d = f.exists ? JSON.parse(f.textSync()) : {};
    meta = { initialDone: d.initialDone === true, lastSyncAt: typeof d.lastSyncAt === 'number' ? d.lastSyncAt : null };
  } catch {
    meta = { initialDone: false, lastSyncAt: null };
  }
  return meta;
}

export function writeMeta(patch: Partial<Meta>): void {
  meta = { ...readMeta(), ...patch };
  if (patch.lastSyncAt !== undefined) useSyncStatus.setState({ lastSyncAt: patch.lastSyncAt });
  try {
    const f = metaFile();
    f.create({ overwrite: true });
    f.write(JSON.stringify(meta));
  } catch (e) {
    console.warn('sync meta save failed', e);
  }
}

/** 설정 화면 "서버 동기화" 줄이 보는 상태 */
export const useSyncStatus = create<{ pending: number; lastSyncAt: number | null }>(() => ({ pending: 0, lastSyncAt: null }));

/** 앱 시작 때 한 번: 파일에서 큐·메타를 읽어 상태에 반영한다. */
export async function initSyncState(): Promise<void> {
  const q = await readQueue();
  useSyncStatus.setState({ pending: q.length, lastSyncAt: readMeta().lastSyncAt });
}
