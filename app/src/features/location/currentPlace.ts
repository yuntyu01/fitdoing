import * as Location from 'expo-location';

const TIMEOUT_MS = 15_000;

export type PlaceResult =
  | { ok: true; lat: number; lng: number; address: string }
  | { ok: false; reason: 'denied' | 'failed' };

/**
 * 지금 위치를 헬스장 위치로 쓴다.
 * 개인정보: 좌표는 폰(로컬 DB)에만 저장한다. 다만 주소를 찾는 역지오코딩은
 * Android 기기 위치 서비스(Google)로 좌표를 보낸다. 우리 서버로는 보내지 않는다.
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
    let address = '';
    try {
      const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (a) {
        address =
          a.formattedAddress ??
          [a.region, a.city, a.district, a.street, a.streetNumber].filter(Boolean).join(' ');
      }
    } catch {
      // 주소를 못 찾아도 좌표만 있으면 지오펜스는 된다.
    }
    return { ok: true, lat, lng, address };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/**
 * 장소 검색을 가까운 순으로 정렬할 때 쓰는 대략의 위치. 권한을 새로 묻지 않고, 이미 허용돼 있을 때 마지막으로 알던
 * 위치만 쓴다(없으면 null — 검색은 정확도 순).
 */
export async function roughPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getLastKnownPositionAsync();
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}
