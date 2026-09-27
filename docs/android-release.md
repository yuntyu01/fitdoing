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

## 처음 한 번은 손으로

Play Console은 새 앱의 첫 AAB를 API로 받지 않는다. dry run으로 받은 서명된 AAB(artifact)를 Play Console 비공개 테스트 트랙에 직접 올린 뒤부터 워크플로 업로드가 된다.

키스토어 만들기:

```bash
keytool -genkeypair -v -keystore fitdoing-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 fitdoing-upload.jks   # KEYSTORE_BASE64 에 붙여넣기
```
