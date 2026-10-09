// app.json 이 기본 설정이고, 여기서는 빌드 때 환경변수에서 받아야 하는 값만 덧붙인다(app.json 은 env 를 읽지 못한다).
// 카카오 SDK 는 prebuild 때 네이티브 앱 키가 있어야 안드로이드 매니페스트에 로그인 콜백(kakao<앱 키>://oauth)을 넣을 수 있다.
const { withProjectBuildGradle } = require('expo/config-plugins');

// 카카오 SDK(com.kakao.sdk:*)는 Maven Central 이 아니라 카카오 저장소에만 있다. @react-native-kakao 모듈은
// 앱 키가 없어도 autolinking 으로 들어오므로 저장소는 키와 상관없이 늘 넣는다 (없으면 bundleRelease 가 의존성을 못 찾는다).
const KAKAO_MAVEN = 'https://devrepo.kakao.com/nexus/content/groups/public/';
const withKakaoMaven = (config) =>
  withProjectBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes(KAKAO_MAVEN)) {
      c.modResults.contents = c.modResults.contents.replace(
        /allprojects\s*\{\s*repositories\s*\{/,
        (m) => `${m}\n    maven { url '${KAKAO_MAVEN}' }`,
      );
    }
    return c;
  });

module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? []), withKakaoMaven];

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
