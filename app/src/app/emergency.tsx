import { Redirect } from 'expo-router';

/** 네이티브 잠금 화면의 "비상 해제"(fitdoing://emergency)가 들어오는 곳. 잠금 컨트롤러가 걸려 있는 잠금 화면으로 보낸다. */
export default function Emergency() {
  return <Redirect href="/" />;
}
