/** 두 좌표 사이 거리(m). 하버사인. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 1000m 미만은 10m 단위 "m", 이상은 소수 한 자리 "km" */
export function formatDistance(m: number): { value: string; unit: 'm' | 'km' } {
  if (m < 1000) return { value: String(Math.max(0, Math.round(m / 10) * 10)), unit: 'm' };
  return { value: (Math.round(m / 100) / 10).toFixed(1), unit: 'km' };
}
