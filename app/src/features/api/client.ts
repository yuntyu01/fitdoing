import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

import type { AiResult, Settings } from '../../db/schema';
import type { MealBackup } from '../../domain/logging';
import { backoffMs, drainQueue, mealQueueKey, toSettingsBody, type QueueItem, type SyncRequest } from '../../domain/sync';
import { getDeviceId, pushItems, readQueue, removeItems, writeMeta } from './store';

// 서버는 AI 중계와 기록 백업만 맡는다. 잠금·기록은 로컬 SQLite가 진실이라
// 서버가 죽어 있어도 앱은 그대로 동작해야 한다. 여기서 던진 오류는 호출한 쪽이 삼킨다.
//
// 개인정보: 사진이 폰 밖으로 나가는 경우는 AI 분석(analyzeMeal) 하나뿐이다.
// 그때도 긴 변 1024px로 줄인 사본만 보내고, 서버는 저장하지 않고 결과 JSON만 돌려준다.
// (사진 백업 설정을 켠 경우의 R2 업로드는 이 파일의 범위 밖이다.)

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8080').replace(/\/+$/, '');

const ANALYZE_TIMEOUT_MS = 30_000;
const BACKUP_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init: { method: string; body?: string | FormData; json?: boolean }, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'X-Device-Id': await getDeviceId() };
    if (init.json) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API_URL}${path}`, { method: init.method, body: init.body, headers, signal: controller.signal });
    if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''));
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** 사진 한 장을 보내 음식 인식 결과를 받는다. photoUri는 이미 긴 변 1024px로 줄인 파일이어야 한다. */
export async function analyzeMeal(photoUri: string): Promise<AiResult> {
  const form = new FormData();
  // expo/fetch의 FormData는 expo-file-system File(Blob)을 파트로 받는다.
  form.append('photo', new File(photoUri));
  const res = await request('/api/meals/analyze', { method: 'POST', body: form }, ANALYZE_TIMEOUT_MS);
  const data = (await res.json()) as Partial<AiResult>;
  return {
    items: Array.isArray(data.items) ? data.items.map((i) => ({ name: String(i.name ?? ''), amount: String(i.amount ?? '') })) : [],
    kcal: Number(data.kcal) || 0,
    carbs: Number(data.carbs) || 0,
    protein: Number(data.protein) || 0,
    fat: Number(data.fat) || 0,
    confidence: Number(data.confidence) || 0,
  };
}

async function send(req: SyncRequest): Promise<number | null> {
  try {
    const res = await request(req.path, { method: req.method, body: JSON.stringify(req.body), json: true }, BACKUP_TIMEOUT_MS);
    return res.status;
  } catch (e) {
    return e instanceof ApiError ? e.status : null; // 네트워크 오류·타임아웃은 null
  }
}

let flushing = false;
let failures = 0;
let nextAttemptAt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 쌓인 백업을 보낸다(설정 → 끼니 → 이벤트 묶음). 네트워크·5xx면 멈추고 백오프 뒤 다시, 4xx로 거절된 건 버린다.
 * force가 아니면 백오프 중에는 건너뛴다(앱 시작·포그라운드 복귀는 force).
 */
export async function flushQueue(force = false): Promise<void> {
  if (flushing) return;
  if (!force && Date.now() < nextAttemptAt) return;
  flushing = true;
  try {
    const res = await drainQueue({
      read: readQueue,
      remove: removeItems,
      send,
      warn: (m, d) => console.warn(m, d),
    });
    if (res.failed) {
      failures += 1;
      const wait = backoffMs(failures);
      nextAttemptAt = Date.now() + wait;
      if (retryTimer) clearTimeout(retryTimer);
      // 앱이 켜져 있는 동안 네트워크가 돌아오면 이 재시도가 큐를 비운다.
      retryTimer = setTimeout(() => void flushQueue().catch(() => {}), wait);
    } else {
      failures = 0;
      nextAttemptAt = 0;
      if (res.sent > 0) writeMeta({ lastSyncAt: Date.now() });
    }
  } catch (e) {
    console.warn('flush failed', e);
  } finally {
    flushing = false;
  }
}

/** 큐에 넣고 잠깐 모았다가(여러 기록이 연달아 생기는 경우) 한 번에 보낸다. 던지지 않는다. */
export async function enqueueItems(items: QueueItem[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const dropped = await pushItems(items);
    if (dropped > 0) writeMeta({ initialDone: false }); // 넘쳐서 버렸다: 다음 기회에 로컬 전체를 다시 올린다.
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => void flushQueue().catch(() => {}), 1500);
  } catch (e) {
    console.warn('enqueue failed', e);
  }
}

/** 끼니 기록 백업 (best effort). 실패해도 로컬 기록에는 영향이 없다. */
export function backupMeal(body: MealBackup): Promise<void> {
  return enqueueItems([{ kind: 'meal', key: mealQueueKey(body.date, body.index), body }]);
}

/** 설정 백업 (best effort). PUT /api/sync/settings 로 값 그대로 올린다. */
export function backupSettings(s: Settings): Promise<void> {
  return enqueueItems([{ kind: 'settings', key: 'settings', body: toSettingsBody(s) }]);
}
