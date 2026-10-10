import * as Location from 'expo-location';

const TIMEOUT_MS = 15_000;

export type PlaceResult =
  | { ok: true; lat: number; lng: number; address: string }
  | { ok: false; reason: 'denied' | 'failed' };

/**
 * 지금 위치를 헬스장 위치로 쓴다.
 * 좌표는 로컬에 저장하며, 주소 조회를 위한 역지오코딩은 하지 않는다.
 */
export async function currentPlace(): Promise<PlaceResult> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'denied' };
  try {
    // 실내(헬스장)에서는 GPS가 안 잡혀 한참 걸릴 수 있다. 15초 넘으면 마지막으로 알던 위치를 쓴다.
    const pos =
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS)),
      ])) ?? (await Location.getLastKnownPositionAsync());
    if (!pos) return { ok: false, reason: 'failed' };
    const { latitude: lat, longitude: lng } = pos.coords;
    return { ok: true, lat, lng, address: '' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
