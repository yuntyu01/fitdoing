# 앱 ↔ 서버 계약 예제

앱(`app/`)이 서버로 보내는 본문의 기준 예제다. 시각은 `/api/meals`의 `loggedAt`만 ISO 문자열이고, `/api/sync/*` 는 epoch ms 이다.

- `settings.json` — `PUT /api/sync/settings` (앱 설정을 그대로 백업. 강도 하향 지연·검증 없이 저장). 2026-10 에 더한 `sex`·`age`·`activity`·`activityInput`·`nutrition`·`targetHistory`·`foodStyle`·`allergies`·`fasting` 은 키를 빼면 서버에 저장된 값이 남고, `null` 이면 지운다 (docs/nutrition-targets.md)
- `meal.json` — `POST /api/meals`
- `sync-events.json` — `POST /api/sync/events` (헬스·취침·잠금·쿠폰 사용 기록을 한꺼번에, 멱등)

서버 테스트(Go)와 앱 테스트(jest)가 같은 파일을 읽어, 한쪽이 모양을 바꾸면 바로 깨진다.
