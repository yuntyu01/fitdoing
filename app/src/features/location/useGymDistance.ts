import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import { distanceMeters } from '../../domain/geo';

export type DistanceState =
  | { status: 'loading' }
  | { status: 'ok'; meters: number }
  | { status: 'denied' } // 위치 권한 없음
  | { status: 'failed' } // 위치를 못 잡음 (실내 등)
  | { status: 'noPlace' }; // 헬스장 위치 미설정

/** 헬스장까지 거리. 권한을 묻지 않고 읽고, 없으면 request()로 요청한다. 좌표는 폰 밖으로 나가지 않는다. */
export function useGymDistance(place: { lat: number | null; lng: number | null }) {
  const [state, setState] = useState<DistanceState>({ status: 'loading' });
  const { lat, lng } = place;

  const measure = useCallback(
    async (ask: boolean) => {
      if (lat === null || lng === null) return;
      try {
        let perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted && ask) perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return setState({ status: 'denied' });
        const pos =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!pos) return setState({ status: 'failed' });
        setState({
          status: 'ok',
          meters: distanceMeters({ lat, lng }, { lat: pos.coords.latitude, lng: pos.coords.longitude }),
        });
      } catch {
        setState({ status: 'failed' });
      }
    },
    [lat, lng],
  );

  useEffect(() => {
    const id = setTimeout(() => measure(false), 0);
    return () => clearTimeout(id);
  }, [measure]);

  const noPlace = lat === null || lng === null;
  return {
    state: noPlace ? ({ status: 'noPlace' } as DistanceState) : state,
    request: () => {
      setState({ status: 'loading' });
      return measure(true);
    },
    refresh: () => {
      setState({ status: 'loading' });
      return measure(false);
    },
  };
}
