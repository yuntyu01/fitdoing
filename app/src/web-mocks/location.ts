// 웹 스크린샷용 expo-location 목. 시안의 헬스장 위치를 돌려준다.
export const Accuracy = { Balanced: 3, High: 4 };
const pos = { coords: { latitude: 37.5446, longitude: 127.0557 } };
export const requestForegroundPermissionsAsync = async () => ({ granted: true });
export const getCurrentPositionAsync = async () => pos;
export const getLastKnownPositionAsync = async () => pos;
export const reverseGeocodeAsync = async () => [{ formattedAddress: '서울 성동구 연무장길 00' }];
export const getForegroundPermissionsAsync = async () => ({ granted: true });
export const watchPositionAsync = async () => ({ remove: () => {} });
