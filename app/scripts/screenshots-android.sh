#!/usr/bin/env bash
# 에뮬레이터/실기기에서 adb screencap 으로 찍는 보조 스크립트.
# 사용: npm run screenshots:android -- [딥링크 경로...]   예) -- / /records /settings
# 경로를 안 주면 지금 화면 한 장만 찍는다. 앱(dev client)이 이미 설치·실행 중이어야 한다.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="../docs/screenshots/android"
ADB="${ADB:-adb}"

DEV=$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1; exit}')
if [ -z "$DEV" ]; then
  echo "연결된 기기가 없다 (adb devices 에서 'device' 상태가 없음). unauthorized 면 기기에서 USB 디버깅을 허용할 것." >&2
  exit 1
fi
mkdir -p "$OUT"

shot() { "$ADB" -s "$DEV" exec-out screencap -p > "$OUT/$1.png"; echo "  $OUT/$1.png"; }

if [ $# -eq 0 ]; then
  shot "current"
else
  for r in "$@"; do
    "$ADB" -s "$DEV" shell am start -a android.intent.action.VIEW -d "fitdoing://${r#/}" com.fitdoing.app >/dev/null
    sleep 2
    name=$(echo "${r#/}" | tr '/' '-'); shot "${name:-home}"
  done
fi
