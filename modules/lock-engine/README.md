# lock-engine

Android 잠금 엔진 (Expo 로컬 모듈, Kotlin). "잠금은 시간이 걸고, 행동이 푼다."
RN과 독립된 엔진(`core`)에 얇은 Expo 브리지(`bridge`)를 붙인 구조다. **모든 판단은 기기 안에서 하고 네트워크를 쓰지 않는다.** 서버가 죽어도 잠기고 풀린다.
칼로리·영양 수치는 엔진 입력에 아예 없다(칼로리 초과로는 절대 잠그지 않는다. 테스트로 고정).

## 구조

```
index.ts, src/LockEngine.types.ts   JS 계약 (앱은 index.ts 만 import)
plugin/index.js                     config plugin: 권한, queries, 딥링크 meta-data
expo-module.config.json             Android 전용 모듈 등록
android/src/main/java/expo/modules/lockengine/
  core/logic/   Android 의존 없는 순수 Kotlin (판정·스케줄 계산·허용 목록·직렬화). JVM 단위 테스트 대상
  core/         LockEngine(싱글턴), AlarmScheduler/AlarmReceiver, BootReceiver, LockService, LockActivity,
                LockStore(SharedPreferences), AllowedApps, Permissions
  bridge/       LockEngineModule (Expo Modules API)
android/src/main/AndroidManifest.xml  서비스·리시버·Activity (라이브러리 매니페스트 병합)
```

앱 연결: `app/package.json` 의 `expo.autolinking.nativeModulesDir = "../modules"`, `app/app.json` plugins 에 `"../modules/lock-engine/plugin"`.
JS 에서 쓰려면 `app/metro.config.js`(watchFolders, nodeModulesPaths)와 `app/tsconfig.json`(paths, include)에 이미 반영했다.

## JS 계약 (index.ts)

| 함수 | 설명 |
|---|---|
| `startLock(type, untilEpochMs, allowedPackages)` | 즉시 잠금. 같은 종류가 있으면 until 은 더 늦은 쪽 |
| `releaseLock(type, releasedBy='action')` | 해제. 그 시점에 걸린 같은 종류의 스케줄 구간은 "해결됨"이 되어 다시 안 잠긴다 |
| `releaseAll(releasedBy='emergency')` | 전부 해제 |
| `getLockState()` | `{ locked, locks[{type,startedAt,until,allowedPackages}], hasSchedule }` |
| `setSchedule(settings, { ignoreStarted })` | 앱 `Settings` 를 그대로 넘겨도 됨. 엔진은 mode/meals/gym/sleep/allowedApps/lockMinutes 만 읽음. 온보딩 직후 첫 호출엔 `ignoreStarted: true` 권장 |
| `markDone(type, 'YYYY-MM-DD', index?)` | 마감 전에 이미 기록(끼니, index 필수)/해결(헬스)한 구간은 잠기지 않게 표시 |
| `addLockStartedListener` / `addLockReleasedListener` | `onLockStarted`, `onLockReleased`(releasedBy: action/time/emergency/coupon, endedAt) |
| `drainEventLog()` | 앱이 죽어 있는 동안 생긴 이벤트를 읽고 비움. 앱 시작 시 1회 읽어 LockEvent DB 에 반영 |
| `getPermissionStatus()`, `openPermissionSettings(kind)` | usageAccess / overlay / exactAlarm / batteryOptimization / notifications. 설정 화면을 열 뿐이라 결과는 앱 복귀 시 다시 조회 |
| `openVendorBatterySettings()` | 삼성(`com.samsung.android.lool`)·샤오미(`com.miui.powerkeeper`, `com.miui.securitycenter`) 화면, 없으면 표준 배터리 최적화 목록 |
| `getLaunchableApps()` | 설정의 "허용할 앱" 선택용 목록 |
| `isAvailable` | iOS/웹/Expo Go 에서는 false, 나머지 함수는 안전한 기본값 반환 |

설정 필드: 헬스 `gym.days` 0=월..6=일, `gym.arriveBy`, 취침 `sleep.bedTime/wakeTime`, 끼니 `meals[{index,deadline}]` (앞 끼니보다 이르거나 같은 마감은 자정을 넘긴 것으로 처리 — 앱 `domain/meals.ts` 와 같은 규칙).

## 동작

- **스케줄 -> 잠금 구간**: 끼니 = 마감~마감+lockMinutes, 헬스 = 도착 시간~+lockMinutes(헬스 종료 시각이 설정에 없어서 이렇게 정함), 취침 = 취침~다음 기상. `mode: mild` 는 아무것도 잠그지 않는다.
- **AlarmManager**: 다음 경계(구간 시작 또는 걸린 잠금의 until) 하나만 `setExactAndAllowWhileIdle` 로 예약하고, 울릴 때마다 다시 계산해서 다음 걸 예약한다. 정확한 알람 권한이 없으면 근사 알람으로 낮춘다(몇 분 늦을 수 있음).
- **BootReceiver**: 부팅·앱 업데이트·시각/시간대 변경 때 저장된 스케줄·잠금·해결 키로 복구한다(SharedPreferences `lock_engine`). 부팅 시점이 구간 안이면 다시 잠근다.
- **LockService**(포그라운드, `specialUse`): 잠금이 있을 때만 돈다. 0.5초마다 `UsageStatsManager.queryEvents` 로 포그라운드 앱을 보고, 차단 대상이면 `LockActivity` 로 덮는다. 알림을 눌러 차단 앱이 열려도 같은 경로로 덮인다. 모든 잠금이 풀리면 스스로 멈춘다.
- **허용 목록**: 본 앱, 런처, 전화, 문자, 지도, 알람, 키보드(기기에서 인텐트로 찾음 + 주요 패키지 고정 목록) + 설정/`startLock` 으로 넘긴 앱. 여러 잠금이 동시에 걸려 있으면 모두가 허용해야 통과.
- **LockActivity**: 검정 `#151515` 네이티브 레이아웃. 남은 시간(가장 먼저 풀리는 잠금 기준) 카운트다운, "지금 찍어서 풀기" -> `fitdoing://capture`, 전화/문자/지도, "비상 해제" -> `fitdoing://emergency`. 뒤로 가기는 홈으로 보낸다. 해제는 이 화면이 하지 않고 앱(JS)이 `releaseLock` 을 부르면 화면이 스스로 닫힌다.
  딥링크 주소는 plugin 옵션 `captureUri`, `emergencyUri` 로 바꾼다. **앱에 `/emergency` 라우트가 있어야 한다.**
- 매니페스트: 서비스·리시버·Activity 는 모듈 매니페스트(병합), 권한·`<queries>`·meta-data 는 plugin.

## 해제 트리거와 한계

- 끼니 사진 저장, 비상, 쿠폰, 헬스 도착은 전부 JS 가 `releaseLock` 을 부른다. 기상 시각·until 은 엔진이 시간 경과로 푼다.
- **헬스 지오펜스는 이번에 네이티브가 아니다.** Play Services Geofencing 을 쓰지 않았고, 앱(expo-location)이 도착을 판단해 `releaseLock('gym')` 을 호출한다. 한계: 앱 프로세스가 죽어 있으면 도착해도 풀리지 않는다(lockMinutes 가 지나면 시간으로 풀림). 네이티브 지오펜스는 Phase 4 에서 `core` 에 추가 예정.
- 감지는 UsageStats 폴링이라 앱이 뜬 뒤 최대 약 0.5~1.5초 뒤에 덮인다. **AccessibilityService 는 쓰지 않았다. 폴링으로 부족하다고 확인되면 2차로 추가한다**(그때 Play 용도 공개 문구와 사용자 안내 화면 필요).

## 권한과 Play 정책 메모

| 권한 | 이유 | 비고 |
|---|---|---|
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE` | 잠금 중 포그라운드 앱 감시 | Play Console 의 FGS 선언에 `specialUse` 용도를 적어야 함. BOOT_COMPLETED 에서 시작 가능한 타입이라 `dataSync` 대신 선택(Android 15 가 dataSync 시작을 막음) |
| `SCHEDULE_EXACT_ALARM` | 마감·취침 시각 정확도 | 사용자가 설정에서 허용. `USE_EXACT_ALARM` 은 자동 허용이지만 Play 가 알람/캘린더 앱에만 허용하므로 기본 off(plugin `useExactAlarm: true` 로 전환 가능) |
| `RECEIVE_BOOT_COMPLETED` | 재부팅 복구 | |
| `PACKAGE_USAGE_STATS` | 포그라운드 앱 감지 | 설정 화면에서 사용자가 직접 허용 |
| `SYSTEM_ALERT_WINDOW` | 오버레이를 그리지는 않는다. Android 10+ 에서 백그라운드 Activity 시작이 막히는데 이 권한이 있으면 예외가 되어 잠금 화면을 띄울 수 있다 | 없으면 잠금 화면이 안 뜰 수 있음(감지는 됨) |
| `POST_NOTIFICATIONS` | 포그라운드 서비스 알림 | 런타임 팝업은 expo-notifications |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | 삼성·샤오미에서 서비스·알람이 죽는 것을 줄임 | Play 는 "배터리 최적화 예외가 핵심 기능에 필수"인 앱만 허용. 정책 위반 소지가 있으면 이 권한 대신 `openVendorBatterySettings()`(설정 목록 화면만 열기)로 줄이는 쪽을 검토 |
| `<queries>` | 전화·문자·지도·알람·런처 앱을 찾고 설정에서 허용 앱 목록을 보여주기 위함 | `QUERY_ALL_PACKAGES` 는 쓰지 않음 |

Play Console 에 적을 공개 문구(안): "사용 기록 접근: 사용자가 정한 식단·운동·수면 약속 시간에, 선택한 앱이 열렸을 때 잠금 화면을 보여주기 위해 포그라운드 앱 이름만 기기 안에서 확인합니다. 어떤 정보도 기기 밖으로 보내지 않습니다. 오버레이/다른 앱 위 표시 권한: 잠금 화면을 즉시 띄우기 위해 사용합니다." 전화·문자·지도는 항상 허용하고 비상 해제를 제공해 사용자가 갇히지 않게 한다.

## 테스트 / 빌드

```bash
cd app && npx expo prebuild --platform android --no-install
cd android && ./gradlew :lock-engine:testDebugUnitTest   # core.logic JVM 단위 테스트 35개
cd android && ./gradlew :lock-engine:compileDebugKotlin
```

실기기 검증이 필요한 것(자동 테스트 없음): 포그라운드 감지, 잠금 화면 덮기, 알람 정확도, 부팅 복구, 알림 우회, 제조사 설정 화면 인텐트, 권한 화면 이동.
