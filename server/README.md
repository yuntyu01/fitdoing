# server

Go + PostgreSQL. Phase 2에서 만든다. KoDeploy에 배포한다.

- Gemini 중계: 앱이 보낸 사진(긴 변 1024px)을 Gemini에 넘기고 고정 JSON 스키마로 돌려준다. 사진은 서버에 저장하지 않는다.
- 기록 백업: 사용자가 백업을 켰을 때만 사진을 R2에 올린다.
