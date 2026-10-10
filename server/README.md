# server

Go 1.26 + 표준 `net/http`(ServeMux) + GORM + PostgreSQL (테스트·로컬 개발은 인메모리 SQLite, cgo 없음). 잠금 판단·해제는 전부 폰 안에서 하고, 서버는 AI 중계와 기록 백업·통계만 맡는다. 로그인(카카오·구글·애플)이 필수이고, 데이터는 계정(user) 단위로 나뉜다. 로그인 방식은 `docs/contract/auth.md`.

## 구조
```
cmd/server          진입점(환경변수 → DB → 라우터)
internal/api        서비스 조립, 라우트, 마이그레이션(로그인 이전 스키마는 비움), 통합 테스트
internal/auth       로그인(카카오·구글·애플 토큰 확인, 로그인 토큰 발급, 회원 탈퇴)
internal/platform   설정, 에러, HTTP 헬퍼, 날짜(주=월요일), CORS·로깅, DB 연결
internal/settings   설정 백업(정규화 테이블), 목표 추천, 강도 변경 규칙
internal/meal       끼니 기록
internal/lock       잠금 이력
internal/coupon     휴식권·치팅 쿠폰·비상 해제
internal/gym        헬스 체크인, 취침 기록
internal/stats      오늘·월간·날 카드
internal/appsync    앱 동기화(이벤트 push, 전체 snapshot)
internal/ai         FoodAnalyzer, 목업, Gemini
internal/share      공개 식단 페이지(/s/{토큰}): 친구에게 공유한 끼니만, 로그인 없이
internal/photo      사진 백업(켠 사용자만): 저장소(로컬 폴더·Cloudflare R2), meal_photos
internal/friends    친구: 친구 코드, 친구 맺기, 공유한 식단·헬스 피드, 친구의 하루, 응원·댓글, 친구 사진
```

## 실행
```
# Postgres (운영)
DB_URL="host=localhost user=fitdoing password=fitdoing dbname=fitdoing port=5432 sslmode=disable" go run ./cmd/server

# 개발: DB 없이 (메모리/파일 SQLite) + 목업 AI
DB_URL=sqlite::memory: AI_PROVIDER=mock go run ./cmd/server
DB_URL=sqlite:./dev.db go run ./cmd/server

go vet ./... && go test ./...      # 인메모리 SQLite
docker build -t fitdoing-server .   # KoDeploy용 멀티스테이지 이미지
```

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | 리슨 포트 |
| `DB_URL` | 로컬 Postgres | Postgres DSN(`postgres://…`도 가능). `sqlite:` 접두사면 SQLite(`sqlite::memory:`, `sqlite:./dev.db`) |
| `DATABASE_URL`, `DB_HOST`·`DB_PORT`·`DB_NAME`·`DB_USER`·`DB_PASSWORD`·`DB_SSLMODE` | — | `DB_URL`이 없을 때 차례로 사용 (호스팅이 주입하는 DB 정보, `DB_SSLMODE` 기본 `disable`) |
| `DB_DRIVER` | 자동 | `postgres` \| `sqlite` (`DB_URL`로 추론, 둘 다 없으면 postgres) |
| `AI_PROVIDER` | `mock` | `mock` \| `gemini` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | -, `gemini-3.5-flash-lite` | gemini일 때 필수/선택. `GEMINI_MODEL`은 모든 사용자의 기본 모델. `gemini-2.5-flash`는 이제 404 |
| `GEMINI_MODELS` | - | (선택) 관리자가 지정할 수 있는 모델을 더할 때만. 기본으로 `gemini-3.5-flash-lite`·`gemini-3.8-flash`는 설정 없이 지정할 수 있다(`platform.BuiltinGeminiModels`) |
| `ADMIN_TOKEN` | - | 32자 이상이면 관리자 API(`/api/admin/*`, 헤더 `X-Admin-Token`)를 켠다. 비우면 관리자 API는 404 |
| `ZONE` | `Asia/Seoul` | 서버 기준 시간대(강도 변경 적용일 등) |
| `CORS_ORIGINS` | `*` | 쉼표로 구분한 허용 출처. 웹 미리보기용 |
| `AUTH_SECRET` | SQLite일 때만 개발용 기본값 | 로그인 토큰 서명 키, **32자 이상** (`openssl rand -hex 32`). Postgres에서 비어 있으면 서버가 시작하지 않는다 |
| `GOOGLE_CLIENT_IDS` | - | 구글 로그인의 웹 클라이언트 ID(쉼표로 여러 개). 앱의 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`와 같은 값 |
| `PUBLIC_BASE_URL` | 요청 주소 | 공유 페이지 링크의 앞부분(예: `https://fitdoing.app`). 비우면 요청이 들어온 주소(프록시 뒤면 `X-Forwarded-Proto/Host`) |
| `PHOTO_STORE` | 비움(사진 백업 끔) | `file`(`PHOTO_DIR`, 기본 `./photos`) \| `r2`. 비우면 사진 백업 API는 503 `PHOTO_BACKUP_UNAVAILABLE` |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | - | `PHOTO_STORE=r2`일 때 모두 필수. 엔드포인트는 `https://<계정 ID>.r2.cloudflarestorage.com` (S3 호환 API, 서명 V4, region `auto`) |
| `AUTH_DISABLED` | - | `1`이면 로그인 없이 쓴다(개발·비공개 테스트용). Bearer 토큰마다 따로 사용자가 생긴다: 앱(`EXPO_PUBLIC_AUTH_DISABLED=1`)은 설치마다 무작위 기기 토큰을 만들어 보내므로 테스터마다 기록이 나뉘고 테스터끼리 친구도 된다. 16자 미만 토큰은 거절, `dev`는 공용 `dev-user`(curl용). 앱을 지우면 새 사용자가 된다 |
| `KAKAO_APP_ID` | - | 카카오 앱 ID(숫자). 다른 앱에서 발급한 토큰은 거절한다 |
| `KAKAO_TOKEN_INFO_URL` | 카카오 기본 주소 | 카카오 토큰 확인 주소. 가짜 카카오로 끝에서 끝까지 시험할 때만 바꾼다 |
| `APPLE_CLIENT_ID` | `com.fitdoing.app` | 애플 identityToken의 audience (앱 번들 ID) |

키가 없는 로그인은 503 `PROVIDER_NOT_CONFIGURED`를 돌려준다.

`GET /healthz` 로 상태를 확인한다. 테이블은 시작할 때 자동 생성·갱신한다(AutoMigrate). 로그인 이전(기기 ID 기준) 스키마의 DB를 만나면 그 테이블을 모두 지우고 계정 기준으로 새로 만든다(기기 ID 백업은 계정에 연결할 수 없어서 버린다).

## AI (음식 인식)
- `ai.FoodAnalyzer` 인터페이스. `AI_PROVIDER=mock`(기본, 사진 해시로 고른 고정 샘플) | `gemini`.
- Gemini: `generateContent`에 사진을 `inline_data`(base64)로 보내고 `responseSchema`로 JSON을 고정한다. 키는 서버에만 둔다. 실패하면 502 `AI_FAILED`.
- 음식마다 칼로리·탄단지를 받고(`items[].kcal/carbs/protein/fat`), 끼니 합계는 서버가 더한다. 응답은 숫자 누락·범위(`Result.Validate`)를 검사해서 어기면 `AI_FAILED`. 음식별 값은 `meal_items`에 저장되고(직접 입력한 음식은 null), 끼니 합계는 `meal_logs`가 기준이다.
- 사진은 저장하지 않는다(메모리에서만 처리, 디스크에 쓰지 않음). 결과 JSON만 돌려준다: `{items:[{name, amount}], kcal, carbs, protein, fat, confidence}`
- 사진 5MB 초과 413 `PHOTO_TOO_LARGE`, 이미지가 아니면 400 `INVALID_PHOTO`.
- 모델: 사용자마다 관리자가 지정한 모델(`user_ai_models`)을 쓰고, 지정이 없으면 `GEMINI_MODEL`. 허용 모델은 `GEMINI_MODEL` + 기본 목록(`gemini-3.5-flash-lite`, `gemini-3.8-flash`) + `GEMINI_MODELS`뿐이다. 지정했던 모델을 설정에서 빼면 그 사용자는 기본 모델로 돌아간다(지정 기록은 남는다). 응답 헤더 `X-AI-Model`이 쓴 모델이다.

## 관리자 API (`X-Admin-Token: <ADMIN_TOKEN>`, 사용자 로그인과 별개)
| | |
|---|---|
| GET `/api/admin/ai-models` | `{default, allowed[]}` |
| GET `/api/admin/users?limit=50&offset=0` | 최근 가입 순 `{users:[{id, createdAt, nickname, providers[], aiModel(지정, 없으면 null), effectiveModel(실제로 쓰는 모델)}]}` |
| PUT `/api/admin/users/{id}/ai-model` | `{"model":"gemini-3.8-flash"}` 지정, `{"model":null}` 기본으로. 허용 목록 밖 400 `INVALID`, 없는 사용자 404 |

```bash
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://<서버>/api/admin/users
curl -X PUT -H "X-Admin-Token: $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"model":"gemini-3.8-flash"}' https://<서버>/api/admin/users/<id>/ai-model
```

## 사진 백업 (설정에서 켠 사용자만)
- 분석용 사진은 저장하지 않는다. 사용자가 켰을 때만 앱이 끼니 사진(긴 변 1024px)을 따로 올린다. 키는 `u/<user>/<date>_<index>_<nanos>.jpg`, 행은 `meal_photos`(사용자·날짜·끼니당 하나).
- 같은 끼니를 다시 올리면 바꾸고 옛 객체를 지운다. 끼니를 지우면(DELETE `/api/meals`) 사진도, 회원 탈퇴 때는 모든 사진이 함께 지워진다. 백업을 끄면 앱이 DELETE `/api/meals/photos`로 모두 지운다.
- R2 서명(SigV4)은 SDK 없이 직접 구현했고 AWS 문서 예제 서명으로 테스트한다. 실제 R2 계정으로는 아직 시험하지 않았다(로컬 폴더 저장소로 끝에서 끝까지 확인).
- Gemini 구현체는 실제 키로 호출해 응답과 스키마를 확인했다(단색 이미지 → 빈 결과). 음식 사진 10장(위키백과)으로 3.5 Flash-Lite가 10장 모두 기준 ±20% 안, 중앙 2.8초(2026-10-08).

## API (`/api/auth/login`, `/api/targets/recommend`, `/healthz` 외에는 `Authorization: Bearer <로그인 토큰>` 필요, 없거나 틀리면 401 `UNAUTHORIZED`. 날짜는 기기 로컬 `YYYY-MM-DD`)
| | |
|---|---|
| GET/PUT `/api/settings` | 설정. 강도를 낮추면 다음 주 월요일부터 적용(`pendingMode`/`pendingFrom`), 목표 칼로리 1200 미만 `TARGET_BELOW_MINIMUM`. 목표 칼로리·탄단지는 1200 이상이면 직접 정한 값 그대로 저장 |
| POST `/api/auth/login` | `{provider, token}` → `{token, userId, isNew}` (공개) |
| DELETE `/api/account` | 회원 탈퇴: 계정과 모든 기록 삭제, 204 |
| GET `/api/targets/recommend?goal=&weightKg=[&heightCm=&age=&sex=&activity=&mode=]` | 목표 추천 (로그인 불필요). 구형 요청(goal·weightKg만)은 예전 체중 기반 값 그대로, 신체 정보를 함께 보내면 2025 KDRI 성인 EER 기반(유지 추정 `maintenanceKcal`과 목표 분리). docs/nutrition-targets.md |
| POST `/api/meals/analyze` (multipart `photo`) | 음식 인식 (로그인 필요, 유료 호출) |
| POST/GET/DELETE `/api/meals` | 끼니 기록(같은 끼니는 덮어쓰기, portion 0.25/0.5/1/1.5/2, 열린 끼니 잠금 해제) |
| GET `/api/today?date=&time=` | 홈: 합계·식단 표·연속 기록·헬스 주간·쿠폰. `time`(폰 현지 `HH:mm`, 선택)을 주면 마감이 지난 미기록 끼니는 `missed`, 남은 끼니 `target`은 오늘 남은 양 ÷ 남은 끼니 수 |
| GET `/api/stats/weekly?date=` | 홈 주간 그래프: 이번 주·지난주 요일별 영양(칼로리·탄단지), 이번 주 평균(오늘 제외)·지난주 평균, 목표, ±10% 범위, `summary`(영양소별 완료한 날·범위 안에 든 날·가장 벗어난 날) |
| GET `/api/records/month?month=2026-09`, `/api/records/day?date=` | 기록 탭 달력·날 카드 |
| POST `/api/locks`, `/api/locks/{id}/release` | 잠금 이력. 해제 수단 action·time·emergency·coupon |
| GET `/api/coupons?date=`, POST `/api/coupons/rest?date=` | 휴식권·치팅 쿠폰·비상 해제 (월요일 초기화, 소진 시 409 `COUPON_EMPTY`) |
| POST `/api/gym/check-in`, `/api/sleep` | 헬스 인증(geofence·photo), 취침 기록 |
| PUT `/api/sync/settings` | 앱 설정을 그대로 백업(`docs/contract/settings.json` 모양). `PUT /api/settings` 와 달리 강도 하향 지연·1200kcal·끼니 연속 검증이 없고 pending 은 지운다. 형식 오류만 400. 정규화 테이블에서 다시 읽어 `{settings, pendingMode, pendingFrom}` 반환. 같은 본문 반복은 멱등(자식 행 교체) |
| POST `/api/sync/events` | 앱 이벤트 일괄 업로드(`docs/contract/sync-events.json` 모양, 시각은 epoch ms). 한 트랜잭션·멱등 upsert: gymLogs (날짜), sleepLogs (날짜, null 은 덮어쓰지 않음), lockEvents (type+startedAt, endedAt·releasedBy 갱신), couponUses (type+usedAt, 없을 때만 insert). 쿠폰 잔량·비상 한도는 검사하지 않음. 잘못된 항목이 하나라도 있으면 400 이고 아무것도 저장하지 않음. 응답 `{gymLogs, sleepLogs, lockEvents, couponUses}` = 처리한 건수 |
| PUT/GET/DELETE `/api/meals/photo?date=&index=` | 사진 백업 한 장(multipart `photo`, JPEG·PNG 5MB 이하) 올리기·받기·지우기 |
| DELETE `/api/meals/photos` | 사진 백업 모두 지우기(백업 끔) |
| GET `/api/friends/code` | 내 친구 코드 `{code}`(8자, A–Z·2–9 중 헷갈리는 0/O·1/I/L 제외). 처음 부를 때 만든다 |
| POST `/api/friends` | `{code}`(대소문자·공백·`-` 무시)로 친구 추가 → `{id, name, since}`. 양방향으로 맺고 이미 친구면 그대로 200. 내 코드 400 `CANNOT_ADD_SELF`, 없는 코드 404 `FRIEND_CODE_NOT_FOUND` |
| GET `/api/friends`, DELETE `/api/friends/{id}` | 친구 목록 `[{id, name, since}]`(최근 맺은 순) · 친구 끊기(양방향 삭제, 204, 멱등) |
| GET `/api/friends/feed?before=&limit=` | 모든 친구의 게시물 최신순 `{posts, nextCursor}`. 게시물 `{id, friendId, name, kind(meal\|gym), date, mealIndex(헬스는 null), loggedAt, items(음식 이름), nutrition(먹은 양, 헬스는 null), hasPhoto, cheers, cheered, comments}`. `limit` 기본 20·최대 50, `before`=이전 응답의 `nextCursor`(마지막 게시물 시각, RFC 3339). 같은 시각 게시물은 한 페이지에 함께 담는다 |
| GET `/api/friends/{id}/day?date=` | 친구의 하루: `{friend, date, entries(공유한 게시물, 시간 순), planned([{mealIndex, deadline}] 아직 기록 없는 끼니), summary{logged, meals, gymDone, gymPlanned}}`. 공유하지 않은 끼니는 entries·planned 어디에도 안 나온다 |
| POST/DELETE `/api/friends/cheers` | `{postId}`(DELETE는 `?postId=`도 가능) 응원/취소 → `{postId, cheers, cheered}`. 사용자·게시물당 하나, 둘 다 멱등 |
| GET/POST `/api/friends/comments`, DELETE `/api/friends/comments/{id}` | 댓글 목록 `?postId=` → `[{id, postId, authorId, name, body, createdAt, mine}]`(오래된 순) · 쓰기 `{postId, body}`(앞뒤 공백 뺀 1~300자) → 201 · 지우기(내 댓글만, 아니면 404) |
| GET `/api/friends/photo?postId=` | 친구가 공유한 끼니의 백업 사진(주인이 사진 백업을 켜서 올린 것만). 없으면 404 |
| GET `/api/sync/snapshot` | `{settings, meals, gymLogs, sleepLogs, lockEvents, couponUses, photos}` 전체(이벤트는 위와 같은 모양, epoch ms, meals 는 `/api/meals` 의 MealView). 설정을 한 번도 저장한 적 없으면 `settings: null` |

친구 공개 규칙: 친구(양방향)만 서로의 게시물을 본다. 친구가 아니거나, 공유하지 않았거나, 없는 게시물·친구는 모두 404 `NOT_FOUND`(무엇이 있는지 알려 주지 않는다). 게시물은 따로 저장하지 않고 기록에서 만든다.
- 식단: `meal_logs.share_friends = true` 인 끼니. id `meal:<주인>:<날짜>:<끼니 번호>`. 기록마다 앱이 정하고(기본값 = 설정 `shareFriends`), 공유를 끄면 응원·댓글째 안 보인다.
- 헬스: `gym_logs.verified_by` 가 geofence·photo 이고 `check_in_at` 이 있는 날(휴식권은 운동이 아님). id `gym:<주인>:<날짜>`. 헬스 기록에는 공유 여부 칸이 없어서 **주인의 설정 `shareFriends` 가 켜져 있는 동안만** 보인다(끄면 지난 인증도 숨는다).
- 이름은 주인의 설정 `nickname`, 비어 있으면 "친구". 친구를 끊어도 응원·댓글 행은 남지만(다시 맺으면 다시 보임) 끊긴 동안은 볼 수 없다. 회원 탈퇴 때는 모두 지운다.
- 친구 사진은 `photo.Service.Get(주인, 날짜, 끼니)` 를 그대로 쓴다(그 함수는 원래 현재 사용자 확인을 하지 않는다. 확인은 친구 서비스가 먼저 한다).

에러는 `{"code": "...", "message": "..."}`. enum은 소문자 문자열(`normal`, `lose`, `meal`, `action` …).

끼니 기록(`meal_logs` + `meal_items` + 치팅 쿠폰 + 잠금 해제)은 한 트랜잭션이라 중간에 실패하면 아무것도 남지 않는다.

## DB 스키마 (정규화, JSON 컬럼 없음)
모든 데이터 테이블은 `user_id` 로 `users` 를 가리키고 `ON DELETE CASCADE` 다(회원 탈퇴 = 사용자 행 삭제로 전부 삭제). 날짜는 `YYYY-MM-DD` 문자열, 시각은 timestamptz(`time.Time`), 마감 시각은 `HH:mm` 문자열. enum 은 CHECK 제약. 방언 의존 SQL 없이 GORM 으로만 접근(SQLite·Postgres 공통). SQLite 는 연결마다 `foreign_keys=ON`.

| 테이블 | 키 | 주요 컬럼 | 관계·제약 |
|---|---|---|---|
| `users` | PK `id`(uuid) | `created_at` | 루트. 첫 로그인 때 만든다 |
| `identities` | PK `id`, UNIQUE(`provider`, `subject`), FK `user_id` | `provider`(kakao/google/apple), `subject`(제공자 쪽 계정 ID), `created_at` | 이 사용자로 로그인할 수 있는 제공자 계정. CHECK `provider` |
| `user_settings` | PK/FK `user_id` | `mode`, `pending_mode`, `pending_from`, `goal`, `height_cm`, `weight_kg`, `lock_minutes`, `emergency_per_week`, `photo_backup`, `coupon_rest/cheat`, `target_kcal/carbs/protein/fat`, `gym_enabled/arrive_by/name/address/lat/lng/radius_m`, `sleep_enabled`, `bed_time`, `wake_time`, `updated_at` | 사용자당 1행. CHECK `mode`·`pending_mode` ∈ mild/normal/spicy, `goal` ∈ lose/keep/gain |
| `meal_slots` | PK(`user_id`, `idx`) | `deadline` | 설정의 끼니 마감. `idx` 1~6 |
| `gym_days` | PK(`user_id`, `weekday`) | - | 설정의 헬스 요일. `weekday` 0(월)~6(일) |
| `allowed_apps` | PK(`user_id`, `package`) | `position`(순서 유지) | 설정의 허용 앱 |
| `meal_logs` | PK `id`(uuid), UNIQUE(`user_id`, `meal_date`, `meal_index`) | `deadline`, `barcode`, `kcal`, `carbs`, `protein`, `fat`, `confidence`, `portion`, `shared_meal`, `cheat`, `logged_at` | CHECK `portion` ∈ 0.25/0.5/1/1.5/2 (`ck_meal_logs_portion_v2`, 옛 `ck_meal_logs_portion`은 시작할 때 지운다). 같은 끼니는 덮어쓴다 |
| `meal_items` | PK `id`, UNIQUE(`meal_log_id`, `position`) | `name`, `amount` | FK `meal_log_id` → `meal_logs.id` CASCADE. 음식 목록(옛 `items_json`) |
| `gym_logs` | PK `id`, UNIQUE(`user_id`, `gym_date`) | `check_in_at`, `check_out_at`, `verified_by` | CHECK `verified_by` ∈ geofence/photo/rest |
| `sleep_logs` | PK `id`, UNIQUE(`user_id`, `sleep_date`) | `locked_at`, `unlocked_at` | |
| `lock_events` | PK `id`, UNIQUE(`user_id`, `type`, `started_at`), INDEX(`user_id`, `lock_date`) | `lock_date`, `ended_at`, `released_by` | CHECK `type` ∈ meal/gym/sleep, `released_by` ∈ action/time/emergency/coupon(또는 NULL) |
| `friend_codes` | PK/FK `user_id`, UNIQUE(`code`) | `created_at` | 친구 코드(사용자당 하나) |
| `friendships` | PK(`user_id`, `friend_id`), 둘 다 FK | `created_at` | 한 방향씩 두 행. 맺기·끊기는 두 행을 함께 |
| `friend_cheers` | PK(`user_id`, `owner_id`, `kind`, `post_date`, `meal_index`), 둘 다 FK, INDEX(게시물) | `created_at` | 게시물(주인·종류·날짜·끼니 번호, 헬스는 0)당 한 사람 하나. CHECK `kind` ∈ meal/gym |
| `friend_comments` | PK `id`(uuid), FK `author_id`·`owner_id`, INDEX(게시물) | `kind`, `post_date`, `meal_index`, `body`(1~300자), `created_at` | CHECK `kind` ∈ meal/gym |
| `coupon_uses` | PK `id`, UNIQUE(`user_id`, `type`, `used_at`), INDEX(`user_id`, `week_key`) | `week_key`(그 주 월요일) | CHECK `type` ∈ rest/cheat/emergency |
| `user_ai_models` | PK/FK `user_id` | `model`, `updated_at` | 관리자가 지정한 AI 모델. 없으면 기본 모델 |

ER: `users` 1 ─ N `identities`, `users` 1 ─ N {`user_settings`(1:1), `meal_slots`, `gym_days`, `allowed_apps`, `meal_logs`, `gym_logs`, `sleep_logs`, `lock_events`, `coupon_uses`}, `meal_logs` 1 ─ N `meal_items`, `users` 1 ─ 1 `friend_codes`, `users` N ─ N `users` (`friendships`), `users` 1 ─ N `friend_cheers`·`friend_comments`(쓴 사람·게시물 주인 둘 다 CASCADE).

## 안전 규칙
칼로리 초과로는 잠금을 걸거나 기록을 막지 않는다. 치팅 쿠폰이 없어도 끼니는 그대로 기록된다. 목표 칼로리는 1200 아래로 저장할 수 없다.

## 공유 페이지 (내 식단 공개 링크)
- 사용자가 켜면 `{PUBLIC_BASE_URL}/s/{토큰}` 주소의 웹 페이지가 생긴다. 로그인 없이 볼 수 있고, **친구에게 공유한 끼니(share_friends)만** 최근 14일치 보여 준다(설정에서 친구 공유를 켠 경우 헬스 인증도). 공유하지 않은 끼니·사진은 나오지 않는다.
- 토큰은 사용자 ID의 해시가 아니라 무작위 120비트(소문자 base32 24자)다. 해시는 늘 같은 값이라 퍼진 링크를 막을 수 없지만, 무작위 토큰은 끄거나(`DELETE /api/share`) 새로 만들면(`POST /api/share/rotate`) 옛 주소가 바로 404가 된다. 다시 켜면 같은 주소.
- 테이블 `share_links`(user_id PK, token UNIQUE, enabled), users에 CASCADE.
- 페이지는 `noindex` 메타·`X-Robots-Tag`·`Referrer-Policy: no-referrer`를 단다. 사진은 `/s/{토큰}/photo?date=&index=`로, 그 끼니가 공유돼 있고 사진이 있을 때만 준다.

| | |
|---|---|
| GET/POST/DELETE `/api/share` | 내 공유 페이지 상태 `{enabled, token, url}` / 켜기 / 끄기 |
| POST `/api/share/rotate` | 새 주소(옛 주소는 404) |
| GET `/s/{token}` | 공개 HTML 페이지 (로그인 불필요) |
