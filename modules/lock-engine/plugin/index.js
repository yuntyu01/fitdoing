// lock-engine config plugin. app.json 의 plugins 에 "../modules/lock-engine/plugin" 로 등록한다.
// 서비스·리시버·Activity 는 모듈의 android/src/main/AndroidManifest.xml 이 병합으로 넣고,
// 여기서는 앱 매니페스트에만 속하는 것(권한, queries, 딥링크 meta-data)을 넣는다.
//
// 이 파일은 앱 밖(modules/)에 있어서 @expo/config-plugins 를 바로 require 할 수 없다.
// prebuild 의 cwd(앱 루트)부터 찾는다.
const { createRequire } = require('module');
const path = require('path');
const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const { withAndroidManifest, AndroidConfig } = appRequire('expo/config-plugins');

const DEFAULTS = {
  captureUri: 'fitdoing://capture',
  emergencyUri: 'fitdoing://emergency',
  // true: USE_EXACT_ALARM(자동 허용, 단 Play 는 알람/캘린더 앱에만 허용) / false: SCHEDULE_EXACT_ALARM(사용자가 설정에서 허용)
  useExactAlarm: false,
};

const PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.PACKAGE_USAGE_STATS', // 사용자가 설정 화면에서 직접 허용하는 특수 권한
  'android.permission.SYSTEM_ALERT_WINDOW', // 오버레이를 그리진 않지만, 백그라운드에서 잠금 Activity 를 띄우는 예외 조건
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
];

// 패키지 가시성(Android 11+). QUERY_ALL_PACKAGES 대신 필요한 인텐트만 연다.
const QUERY_INTENTS = [
  { action: 'android.intent.action.MAIN', category: 'android.intent.category.HOME' },
  { action: 'android.intent.action.MAIN', category: 'android.intent.category.LAUNCHER' }, // 설정의 "허용할 앱" 목록
  { action: 'android.intent.action.DIAL' },
  { action: 'android.intent.action.SENDTO', scheme: 'smsto' },
  { action: 'android.intent.action.VIEW', scheme: 'geo' },
  { action: 'android.intent.action.SHOW_ALARMS' },
  { action: 'android.intent.action.VIEW', scheme: 'kakaotalk' }, // 카카오톡 열기
];

function ensureUsesPermission(manifest, name, extra) {
  const list = (manifest['uses-permission'] ??= []);
  const found = list.find((p) => p.$['android:name'] === name);
  if (found) Object.assign(found.$, extra);
  else list.push({ $: { 'android:name': name, ...extra } });
}

function withLockEngine(config, props = {}) {
  const opts = { ...DEFAULTS, ...props };
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';

    for (const p of PERMISSIONS) {
      ensureUsesPermission(manifest, p, p.endsWith('PACKAGE_USAGE_STATS') ? { 'tools:ignore': 'ProtectedPermissions' } : {});
    }
    ensureUsesPermission(
      manifest,
      opts.useExactAlarm ? 'android.permission.USE_EXACT_ALARM' : 'android.permission.SCHEDULE_EXACT_ALARM',
      {},
    );

    const queries = (manifest.queries ??= [{}]);
    const q = queries[0];
    q.intent ??= [];
    q.package ??= [];
    if (!q.package.some((e) => e.$['android:name'] === 'com.kakao.talk')) {
      q.package.push({ $: { 'android:name': 'com.kakao.talk' } }); // 카카오톡 실행 인텐트 조회용
    }
    for (const i of QUERY_INTENTS) {
      const exists = q.intent.some((e) => e.action?.[0]?.$['android:name'] === i.action
        && (e.category?.[0]?.$['android:name'] ?? null) === (i.category ?? null)
        && (e.data?.[0]?.$['android:scheme'] ?? null) === (i.scheme ?? null));
      if (exists) continue;
      const entry = { action: [{ $: { 'android:name': i.action } }] };
      if (i.category) entry.category = [{ $: { 'android:name': i.category } }];
      if (i.scheme) entry.data = [{ $: { 'android:scheme': i.scheme } }];
      q.intent.push(entry);
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'expo.modules.lockengine.CAPTURE_URI', opts.captureUri);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'expo.modules.lockengine.EMERGENCY_URI', opts.emergencyUri);
    return cfg;
  });
}

module.exports = withLockEngine;
