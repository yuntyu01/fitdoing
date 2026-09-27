#!/usr/bin/env bash
# WSL2에서 dev client APK를 빌드해 Windows 에뮬레이터(또는 폰)에 설치한다.
# - 빌드는 리눅스 SDK($ANDROID_HOME=~/Android/Sdk), 설치는 Windows adb 서버(ADB_SERVER_SOCKET)로 한다.
# - WSL 메모리(약 7GB)에서 ninja가 코어 수만큼 clang을 띄우면 OOM으로 죽으므로 CPU 4개로 묶는다.
# 사용: npm run android:dev [-- arm64-v8a]   (기본 x86_64 = 에뮬레이터, 실기기는 arm64-v8a)
set -euo pipefail

ABI="${1:-x86_64}"
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ADB_SERVER_SOCKET="${ADB_SERVER_SOCKET:-tcp:127.0.0.1:5037}"
export ADB_MDNS=0
ADB="$ANDROID_HOME/platform-tools/adb"

[ -d android ] || npx expo prebuild --platform android --no-install

(cd android && taskset -c 0-3 ./gradlew assembleDebug --no-daemon -q --max-workers=4 \
  -PreactNativeArchitectures="$ABI")

"$ADB" install -r android/app/build/outputs/apk/debug/app-debug.apk
"$ADB" reverse tcp:8081 tcp:8081
echo "설치 완료. npm start 후 앱을 열면 127.0.0.1:8081 에 붙는다."
