// Prevent a release that enables mandatory login without usable provider configuration.
const env = process.env;
if (env.EXPO_PUBLIC_AUTH_DISABLED === '1') {
  console.log('Legacy test login mode retained. Social login is not enabled in this build.');
} else {
  const checks = {
    EXPO_PUBLIC_API_URL: /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(env.EXPO_PUBLIC_API_URL ?? ''),
    EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY: /^[a-f\d]{32}$/i.test(env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY ?? ''),
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: /^[\w-]+\.apps\.googleusercontent\.com$/.test(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? ''),
  };
  const missing = Object.keys(checks).filter(key => !checks[key]);
  if (missing.length) throw new Error(`Social-login release configuration missing or invalid: ${missing.join(', ')}`);
  console.log('Social-login release configuration validated (values hidden).');
}
