// 웹 스크린샷용 expo-notifications 목. 아무것도 예약하지 않는다.
const ok = async () => ({ granted: true });
export const setNotificationHandler = () => {};
export const setNotificationChannelAsync = async () => {};
export const getPermissionsAsync = ok;
export const requestPermissionsAsync = ok;
export const cancelAllScheduledNotificationsAsync = async () => {};
export const scheduleNotificationAsync = async () => '';
export const AndroidImportance = { HIGH: 4 };
export const SchedulableTriggerInputTypes = { DATE: 'date' };
export const addNotificationResponseReceivedListener = () => ({ remove: () => {} });
export const dismissAllNotificationsAsync = async () => {};
