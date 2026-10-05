const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');

// 앱 밖의 로컬 모듈(../modules/lock-engine)을 JS 에서 import 하려면 감시 폴더와 의존성 탐색 경로가 필요하다.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../modules')];
config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths ?? []), path.resolve(__dirname, 'node_modules')];

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
