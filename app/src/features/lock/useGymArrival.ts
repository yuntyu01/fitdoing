import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import { distanceMeters } from '../../domain/geo';

export type ArrivalState =
  | { status: 'pending' }
  | { status: 'unavailable' } // 권한 없음·위치 못 잡음·헬스장 좌표 없음
  | { status: 'ok'; meters: number; arrived: boolean };

interface Gym {
  lat: number | null;
  lng: number | null;
  radiusM: number;
}

/**
 * 잠금 화면이 떠 있는 동안 헬스장까지 거리를 계속 본다. 반경 안에 들어오면 onArrive를 한 번 부른다.
 * (features/location/useGymDistance.ts는 한 번만 재는 훅이라, 도착 감지용으로 watch를 따로 쓴다.)
 * 개인정보: 위치는 폰 안에서 거리 계산에만 쓰고 어디에도 저장·전송하지 않는다.
 */
export function useGymArrival(gym: Gym, onArrive: () => void): ArrivalState {
  const [state, setState] = useState<ArrivalState>({ status: 'pending' });
  const arrive = useRef(onArrive);
  useEffect(() => {
    arrive.current = onArrive;
  });
  const { lat, lng, radiusM } = gym;
  const noPlace = lat === null || lng === null;

  useEffect(() => {
    if (lat === null || lng === null) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    let fired = false;

    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return setState({ status: 'unavailable' });
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 5000 },
          (pos) => {
            const meters = distanceMeters({ lat, lng }, { lat: pos.coords.latitude, lng: pos.coords.longitude });
            // 정확도가 나쁘면 오차만큼(최대 50m) 여유를 두고 판단한다.
            const arrived = meters - Math.min(pos.coords.accuracy ?? 0, 50) <= radiusM;
            setState({ status: 'ok', meters, arrived });
            if (arrived && !fired) {
              fired = true;
              arrive.current();
            }
          },
        );
        if (cancelled) s.remove();
        else sub = s;
      } catch {
        setState({ status: 'unavailable' });
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [lat, lng, radiusM]);

  return noPlace ? { status: 'unavailable' } : state;
}
