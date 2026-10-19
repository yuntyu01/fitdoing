// The React Native wrapper exposes native SDK versions through its package metadata.
// Apply the vendor's Android security update after every npm ci, before Gradle reads it.
// https://devtalk.kakao.com/t/151205 (2026-08-18)
const fs = require('node:fs');
const file = require.resolve('@react-native-kakao/core/package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
const android = pkg.sdkVersions?.android;
if (!android) throw new Error('Kakao native SDK version metadata is unavailable');
for (const module of ['core', 'user', 'auth', 'share', 'navi', 'friend', 'talk']) {
  if (module in android) android[module] = '2.25.0';
}
// The wrapper's original API 33 library configuration predates the updated SDK.
android.compileSdk = Math.max(Number(android.compileSdk), 36);
android.targetSdk = Math.max(Number(android.targetSdk), 36);
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('Kakao Android SDK 2.25.0 configured (vendor security update).');
