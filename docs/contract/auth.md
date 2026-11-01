# 로그인 (카카오 · 구글 · 애플)

앱은 각 서비스의 SDK로 로그인한 뒤 받은 토큰을 서버에 보내고, 서버가 확인해서 **자체 로그인 토큰**을 돌려준다.
로그인은 필수다. 로그인하지 않으면 앱은 로그인 화면에서 넘어가지 않는다.

## POST /api/auth/login  (공개)

요청
```json
{ "provider": "kakao" | "google" | "apple", "token": "<제공자가 준 토큰>" }
```

| provider | token 에 넣는 값 |
|---|---|
| kakao  | 카카오 SDK의 **액세스 토큰** |
| google | 구글 로그인의 **ID 토큰** (idToken) |
| apple  | 애플 로그인의 **identityToken** (JWT) |

응답 200
```json
{ "token": "<서버 로그인 토큰>", "userId": "<uuid>", "isNew": true }
```
- 같은 제공자 계정으로 다시 로그인하면 같은 `userId`가 나온다. `isNew`는 이번에 처음 만들어진 계정일 때만 true.
- 기존 테스트 빌드 전환에서는 저장된 `legacyDeviceToken`을 선택적으로 보낼 수 있다. `AUTH_DISABLED=1` 호환 서버에서 제공자 인증을 먼저 통과한 뒤 해당 기기 소유의 익명 기록을 연결한다. 다른 계정에 연결된 ID와 충돌하면 409 `ACCOUNT_LINK_CONFLICT`이며 자동 합치기·삭제를 하지 않는다. 공유 `dev` 계정은 연결 대상이 아니다.
- 제공자 토큰이 틀렸거나 만료됐거나 우리 앱용이 아니면 401 `{ "code": "AUTH_FAILED", "message": "..." }`.
- provider가 셋 중 하나가 아니거나 token이 비면 400 `INVALID`.

## 인증이 필요한 요청

`GET /api/auth/providers`는 공개 설정 상태 `{google: boolean, kakao: boolean}`를 반환한다. ID·키·비밀키와 실제 사용자 로그인 실적을 공개하지 않는다.

`/api/auth/login`, `/healthz`, `/api/targets/recommend` 를 뺀 **모든 `/api/*`** 는 헤더가 필요하다.

```
Authorization: Bearer <서버 로그인 토큰>
```

- 없거나, 위조·만료됐거나, 이미 탈퇴한 계정이면 401 `{ "code": "UNAUTHORIZED", "message": "..." }`.
- 예전의 `X-Device-Id` 헤더는 더 이상 쓰지 않는다 (보내도 무시된다).
- 서버 토큰은 발급 후 90일간 유효하다. 만료되면 401이 오고, 앱은 로그인 화면으로 돌아가 다시 로그인한다.

## DELETE /api/account

로그인한 계정과 그 계정의 모든 기록(설정, 끼니, 헬스, 수면, 잠금, 쿠폰)을 지운다. 응답 204. 되돌릴 수 없다.

## 복원: GET /api/sync/snapshot

모양은 그대로다(`docs/contract/sync-events.json` 참고). 한 번도 백업한 적 없는 계정이면 `settings`가 `null`이고 나머지 배열은 비어 있다.
앱은 로그인 직후 이걸 불러서, `settings`가 있으면 폰 DB를 이 내용으로 채우고 온보딩을 건너뛴다.
