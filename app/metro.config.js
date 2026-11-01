const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');


// 웹은 스크린샷 촬영 전용(scripts/screenshots.mjs). 웹에서 못 도는 네이티브 모듈은 목으로 바꾼다.
// 안드로이드/iOS 번들에는 영향이 없다.
const WEB_MOCKS = {
  'expo-sqlite': 'sqlite.ts',
  'drizzle-orm/expo-sqlite': 'drizzle.ts',
  'drizzle-orm/expo-sqlite/migrator': 'migrator.ts',
  'expo-notifications': 'notifications.ts',
  'expo-location': 'location.ts',
};
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_MOCKS[moduleName]) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'src/web-mocks', WEB_MOCKS[moduleName]) };
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
