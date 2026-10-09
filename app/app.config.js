// app.json 이 기본 설정이고, 여기서는 빌드 때 환경변수에서 받아야 하는 값만 덧붙인다(app.json 은 env 를 읽지 못한다).
// 카카오 SDK 는 prebuild 때 네이티브 앱 키가 있어야 안드로이드 매니페스트에 로그인 콜백(kakao<앱 키>://oauth)을 넣을 수 있다.
module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? [])];

  const kakaoKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
  if (kakaoKey) {
    plugins.push(['@react-native-kakao/core', { nativeAppKey: kakaoKey, android: { authCodeHandlerActivity: true } }]);
  } else {
    console.warn(
      '[app.config] EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY 가 없어 카카오 로그인 설정을 빼고 빌드해요 (.env.example 참고).',
    );
  }

  return { ...config, plugins };
};
