# Android 릴리스

워크플로: `.github/workflows/android-playstore.yml`

- `v0.1.0` 같은 태그 push: 비공개 테스트(alpha) 트랙으로 업로드
- 수동 실행: 트랙 선택, `dry_run`이면 AAB만 만들고 업로드는 건너뜀. 키스토어 Secret이 없으면 디버그 서명으로 빌드만 확인한다.

## GitHub Secrets

| 이름 | 내용 |
| --- | --- |
| `KEYSTORE_BASE64` | 업로드 키스토어(.jks)를 base64로 인코딩한 값 |
| `KEYSTORE_PASSWORD` | 키스토어 비밀번호 |
| `KEY_ALIAS` | 키 별칭 |
| `KEY_PASSWORD` | 키 비밀번호 |
| `PLAY_SERVICE_ACCOUNT_JSON` | Play Console API 서비스 계정 JSON |

## GitHub Variables (앱에 들어가는 설정)

Settings > Secrets and variables > Actions > Variables. 바꾼 뒤 다시 빌드해야 앱에 반영된다.

| 이름 | 지금 값 | 내용 |
| --- | --- | --- |
| `EXPO_PUBLIC_AUTH_DISABLED` | `1` | 로그인 없이 시작(비공개 테스트). 설치마다 무작위 기기 토큰으로 서버 사용자가 따로 생긴다 |
| `EXPO_PUBLIC_API_URL` | (없음) | 서버 주소. KoDeploy 배포 뒤 `https://…`를 넣는다. 비우면 서버 없이 폰 안에서만 동작(AI 분석·백업·친구·공유 페이지 안 됨) |
| `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | (없음) | 로그인을 켤 때 (`EXPO_PUBLIC_AUTH_DISABLED` 를 비우고) |

## 서버 (KoDeploy)

`server/Dockerfile` 로 이미지를 만든다(`CI: server` 워크플로가 PR·main 마다 vet·test·docker build 를 확인한다). 비공개 테스트용 환경변수:

| 이름 | 값 |
| --- | --- |
| `DB_URL` | Postgres DSN |
| `AUTH_SECRET` | `openssl rand -hex 32` |
| `AUTH_DISABLED` | `1` (앱의 `EXPO_PUBLIC_AUTH_DISABLED=1` 과 짝) |
| `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL` | `gemini`, 키, `gemini-3.5-flash-lite` (기본 모델) |
| `ADMIN_PASSWORD` | 관리자 페이지(`/admin`) 비밀번호, 10자 이상. 사용자별 AI 모델(3.5 flash-lite / 3.8 flash) 지정에 쓴다. server/README.md "관리자 페이지 · API" |
| `KAKAO_REST_API_KEY` | 카카오 개발자 콘솔 > 내 애플리케이션 > 앱 키 > REST API 키. 헬스장 이름 검색에 쓴다(없으면 지금 위치로만 설정) |
| `FOODSAFETY_API_KEY`, `DATA_GO_KR_API_KEY` | 바코드 조회. 식품안전나라(foodsafetykorea.go.kr) 오픈API 이용신청 > C005 바코드제품정보 키, 공공데이터포털(data.go.kr) > 식품의약품안전처_식품영양성분DB정보 활용신청 키 |
| `PUBLIC_BASE_URL` | 서버의 공개 주소 (공유 페이지 링크) |
| `PHOTO_STORE` (+ R2 값들) | 사진 백업·친구 사진을 쓰려면 `r2` |

배포한 주소를 `EXPO_PUBLIC_API_URL` 변수에 넣고 앱을 다시 빌드한다.

## 비공개 테스트 올리기

1. Actions > `CD: Android Play Store` > Run workflow (track `alpha`). `PLAY_SERVICE_ACCOUNT_JSON` 이 없으면 업로드는 건너뛰고 서명된 AAB 만 artifact 로 남는다.
2. 첫 버전은 Play Console > 테스트 > 비공개 테스트 > 새 버전 만들기에서 그 AAB 를 직접 올린다 (Play 는 새 앱의 첫 AAB 를 API 로 받지 않는다).
3. 그다음부터는 서비스 계정 JSON 을 `PLAY_SERVICE_ACCOUNT_JSON` Secret 에 넣으면 `v0.1.1` 같은 태그 push 만으로 alpha(비공개 테스트) 트랙에 올라간다.

## 처음 한 번은 손으로

Play Console은 새 앱의 첫 AAB를 API로 받지 않는다. dry run으로 받은 서명된 AAB(artifact)를 Play Console 비공개 테스트 트랙에 직접 올린 뒤부터 워크플로 업로드가 된다.

키스토어 만들기:

```bash
keytool -genkeypair -v -keystore fitdoing-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 fitdoing-upload.jks   # KEYSTORE_BASE64 에 붙여넣기
```
