# server

Go 1.26 + 표준 `net/http`(ServeMux) + GORM + PostgreSQL (테스트·로컬 개발은 인메모리 SQLite, cgo 없음). 잠금 판단·해제는 전부 폰 안에서 하고, 서버는 AI 중계와 기록 백업·통계만 맡는다. 계정·쿠키 없이 `X-Device-Id` 기기 단위로 데이터를 나눈다.

## 구조
```
cmd/server          진입점(환경변수 → DB → 라우터)
internal/api        서비스 조립, 라우트, 마이그레이션(구 스키마 변환 포함), 통합 테스트
internal/platform   설정, 에러, HTTP 헬퍼, 날짜(주=월요일), CORS·로깅, DB 연결
internal/settings   설정 백업(정규화 테이블), 목표 추천, 강도 변경 규칙
internal/meal       끼니 기록
internal/lock       잠금 이력
internal/coupon     휴식권·치팅 쿠폰·비상 해제
internal/gym        헬스 체크인, 취침 기록
internal/stats      오늘·월간·날 카드
internal/appsync    앱 동기화(이벤트 push, 전체 snapshot)
internal/ai         FoodAnalyzer, 목업, Gemini
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
| `DB_DRIVER` | 자동 | `postgres` \| `sqlite` (`DB_URL`로 추론, 둘 다 없으면 postgres) |
| `AI_PROVIDER` | `mock` | `mock` \| `gemini` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | -, `gemini-2.5-flash` | gemini일 때 필수/선택 |
| `ZONE` | `Asia/Seoul` | 서버 기준 시간대(강도 변경 적용일 등) |
| `CORS_ORIGINS` | `*` | 쉼표로 구분한 허용 출처. 웹 미리보기용 |

`GET /healthz` 로 상태를 확인한다. 테이블은 시작할 때 자동 생성·갱신한다(AutoMigrate). JSON 컬럼 시절(`user_settings.json`, `meal_logs.items_json`) DB는 시작할 때 정규화 테이블로 옮기고 컬럼을 지운다.

## AI (음식 인식)
- `ai.FoodAnalyzer` 인터페이스. `AI_PROVIDER=mock`(기본, 사진 해시로 고른 고정 샘플) | `gemini`.
- Gemini: `generateContent`에 사진을 `inline_data`(base64)로 보내고 `responseSchema`로 JSON을 고정한다. 키는 서버에만 둔다. 실패하면 502 `AI_FAILED`.
- 사진은 저장하지 않는다(메모리에서만 처리, 디스크에 쓰지 않음). 결과 JSON만 돌려준다: `{items:[{name, amount}], kcal, carbs, protein, fat, confidence}`
- 사진 5MB 초과 413 `PHOTO_TOO_LARGE`, 이미지가 아니면 400 `INVALID_PHOTO`.
- Gemini 구현체는 가짜 서버로만 테스트했고 실제 키로는 아직 검증하지 않았다.

## API (`X-Device-Id` 헤더 8~64자 `[A-Za-z0-9_-]`, 아니면 400 `DEVICE_ID`. 날짜는 기기 로컬 `YYYY-MM-DD`)
| | |
|---|---|
| GET/PUT `/api/settings` | 설정. 강도를 낮추면 다음 주 월요일부터 적용(`pendingMode`/`pendingFrom`), 목표 칼로리 1200 미만 `TARGET_BELOW_MINIMUM`. 목표 칼로리·탄단지는 1200 이상이면 직접 정한 값 그대로 저장 |
| GET `/api/targets/recommend?goal=&weightKg=` | 목표 칼로리·탄단지 추천 (헤더 불필요) |
| POST `/api/meals/analyze` (multipart `photo`) | 음식 인식 (헤더 불필요) |
| POST/GET/DELETE `/api/meals` | 끼니 기록(같은 끼니는 덮어쓰기, portion 0.25/0.5/1, 열린 끼니 잠금 해제) |
| GET `/api/today?date=` | 홈: 합계·식단 표·연속 기록·헬스 주간·쿠폰 |
| GET `/api/stats/weekly?date=` | 홈 주간 그래프: 이번 주·지난주 요일별 영양(칼로리·탄단지), 이번 주 평균(오늘 제외)·지난주 평균, 목표, ±10% 범위 |
| GET `/api/records/month?month=2026-09`, `/api/records/day?date=` | 기록 탭 달력·날 카드 |
| POST `/api/locks`, `/api/locks/{id}/release` | 잠금 이력. 해제 수단 action·time·emergency·coupon |
| GET `/api/coupons?date=`, POST `/api/coupons/rest?date=` | 휴식권·치팅 쿠폰·비상 해제 (월요일 초기화, 소진 시 409 `COUPON_EMPTY`) |
| POST `/api/gym/check-in`, `/api/sleep` | 헬스 인증(geofence·photo), 취침 기록 |
| PUT `/api/sync/settings` | 앱 설정을 그대로 백업(`docs/contract/settings.json` 모양). `PUT /api/settings` 와 달리 강도 하향 지연·1200kcal·끼니 연속 검증이 없고 pending 은 지운다. 형식 오류만 400. 정규화 테이블에서 다시 읽어 `{settings, pendingMode, pendingFrom}` 반환. 같은 본문 반복은 멱등(자식 행 교체) |
| POST `/api/sync/events` | 앱 이벤트 일괄 업로드(`docs/contract/sync-events.json` 모양, 시각은 epoch ms). 한 트랜잭션·멱등 upsert: gymLogs (날짜), sleepLogs (날짜, null 은 덮어쓰지 않음), lockEvents (type+startedAt, endedAt·releasedBy 갱신), couponUses (type+usedAt, 없을 때만 insert). 쿠폰 잔량·비상 한도는 검사하지 않음. 잘못된 항목이 하나라도 있으면 400 이고 아무것도 저장하지 않음. 응답 `{gymLogs, sleepLogs, lockEvents, couponUses}` = 처리한 건수 |
| GET `/api/sync/snapshot` | `{settings, meals, gymLogs, sleepLogs, lockEvents, couponUses}` 전체(이벤트는 위와 같은 모양, epoch ms, meals 는 `/api/meals` 의 MealView). 설정을 한 번도 저장한 적 없으면 `settings: null` |

에러는 `{"code": "...", "message": "..."}`. enum은 소문자 문자열(`normal`, `lose`, `meal`, `action` …).

끼니 기록(`meal_logs` + `meal_items` + 치팅 쿠폰 + 잠금 해제)은 한 트랜잭션이라 중간에 실패하면 아무것도 남지 않는다.

## DB 스키마 (정규화, JSON 컬럼 없음)
모든 테이블은 `device_id` 로 `devices` 를 가리키고 `ON DELETE CASCADE` 다(기기 행을 지우면 전부 삭제). 날짜는 `YYYY-MM-DD` 문자열, 시각은 timestamptz(`time.Time`), 마감 시각은 `HH:mm` 문자열. enum 은 CHECK 제약. 방언 의존 SQL 없이 GORM 으로만 접근(SQLite·Postgres 공통). SQLite 는 연결마다 `foreign_keys=ON`.

| 테이블 | 키 | 주요 컬럼 | 관계·제약 |
|---|---|---|---|
| `devices` | PK `device_id` | `created_at` | 루트. 쓰기 때 없으면 만든다 |
| `user_settings` | PK/FK `device_id` | `mode`, `pending_mode`, `pending_from`, `goal`, `height_cm`, `weight_kg`, `lock_minutes`, `emergency_per_week`, `photo_backup`, `coupon_rest/cheat`, `target_kcal/carbs/protein/fat`, `gym_enabled/arrive_by/name/address/lat/lng/radius_m`, `sleep_enabled`, `bed_time`, `wake_time`, `updated_at` | 기기당 1행. CHECK `mode`·`pending_mode` ∈ mild/normal/spicy, `goal` ∈ lose/keep/gain |
| `meal_slots` | PK(`device_id`, `idx`) | `deadline` | 설정의 끼니 마감. `idx` 1~6 |
| `gym_days` | PK(`device_id`, `weekday`) | - | 설정의 헬스 요일. `weekday` 0(월)~6(일) |
| `allowed_apps` | PK(`device_id`, `package`) | `position`(순서 유지) | 설정의 허용 앱 |
| `meal_logs` | PK `id`(uuid), UNIQUE(`device_id`, `meal_date`, `meal_index`) | `deadline`, `barcode`, `kcal`, `carbs`, `protein`, `fat`, `confidence`, `portion`, `shared_meal`, `cheat`, `logged_at` | CHECK `portion` ∈ 0.25/0.5/1. 같은 끼니는 덮어쓴다 |
| `meal_items` | PK `id`, UNIQUE(`meal_log_id`, `position`) | `name`, `amount` | FK `meal_log_id` → `meal_logs.id` CASCADE. 음식 목록(옛 `items_json`) |
| `gym_logs` | PK `id`, UNIQUE(`device_id`, `gym_date`) | `check_in_at`, `check_out_at`, `verified_by` | CHECK `verified_by` ∈ geofence/photo/rest |
| `sleep_logs` | PK `id`, UNIQUE(`device_id`, `sleep_date`) | `locked_at`, `unlocked_at` | |
| `lock_events` | PK `id`, UNIQUE(`device_id`, `type`, `started_at`), INDEX(`device_id`, `lock_date`) | `lock_date`, `ended_at`, `released_by` | CHECK `type` ∈ meal/gym/sleep, `released_by` ∈ action/time/emergency/coupon(또는 NULL) |
| `coupon_uses` | PK `id`, UNIQUE(`device_id`, `type`, `used_at`), INDEX(`device_id`, `week_key`) | `week_key`(그 주 월요일) | CHECK `type` ∈ rest/cheat/emergency |

ER: `devices` 1 ─ N {`user_settings`(1:1), `meal_slots`, `gym_days`, `allowed_apps`, `meal_logs`, `gym_logs`, `sleep_logs`, `lock_events`, `coupon_uses`}, `meal_logs` 1 ─ N `meal_items`.

## 안전 규칙
칼로리 초과로는 잠금을 걸거나 기록을 막지 않는다. 치팅 쿠폰이 없어도 끼니는 그대로 기록된다. 목표 칼로리는 1200 아래로 저장할 수 없다.
