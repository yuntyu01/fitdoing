# FitDoing Google / Kakao sign-in

The app uses native Google and Kakao SDKs, with provider tokens verified by its own Go server. Google ID tokens are checked against provider public keys, issuer, audience and expiry. Kakao access tokens are checked with Kakao and must belong to app 1604237. No account linking by email or display name is performed.

`npm ci` runs `scripts/configure-kakao-sdk.cjs` to set the wrapper's Android SDK metadata to 2.25.0 and library compile/target SDK 36. This follows Kakao's [2026-08-18 security/stability update](https://devtalk.kakao.com/t/151205), which covers native Android SDK versions 2.24.0 and below. The React Native wrapper remains pinned through the existing lockfile. No generated Android files are hand-edited.

## Configuration

- App/build: `EXPO_PUBLIC_API_URL=https://fitdoing.kodeploy.com`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`. `EXPO_PUBLIC_AUTH_DISABLED=0` enables mandatory sign-in in the new build.
- iOS source configuration additionally supports `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. It generates the reversed client-ID URL scheme. This does not mean an iOS binary has been built or submitted.
- Server: existing `AUTH_SECRET` remains unchanged; set `GOOGLE_CLIENT_IDS` to the web client ID and `KAKAO_APP_ID=1604237`. Google client secrets and Kakao Admin secrets are not needed for this native token-verification flow. Never embed those secrets in the app.
- Register `com.fitdoing.app` and the actual Play app-signing SHA-1 in a Google Android OAuth client. Kakao needs the matching certificate SHA-1 encoded as Base64. Register upload/debug certificates separately if those builds need login; never substitute an upload certificate for Play app signing.
- `GET /api/auth/providers` returns configuration booleans only. A true value proves server configuration, not a real user sign-in.

## Existing test records

The currently configured `AUTH_DISABLED=1` compatibility mode accepts old random per-install device tokens and verifies real signed sessions separately. Invalid signed sessions never fall back to anonymous access. Do not change the existing server secret when adding providers.

After successful provider verification, the new app can prove possession of its saved device token. The server links that existing anonymous user to a previously unbound provider identity in a transaction; records and user ID remain unchanged. The old anonymous token is retired using a digest that survives account deletion. Unrelated users and shared historical `dev-user` records are never claimed or merged. An identity already attached to a different account returns 409 before the app changes its local data. Unknown/offline-only installations can upload their local records to a new provider account. If that provider already belongs to an existing account, the upgrade pauses with 409 so local records cannot overwrite that account.

Legacy schemas are now refused at startup without dropping tables. A reviewed migration is required if such a schema exists. No production data should be erased to enable login.

## Build and release boundaries

For a signed AAB without Play upload, dispatch `CD: Android Play Store` from this branch with `dry_run=true`, `enable_social_login=true`, and an appropriate version name. Existing global test-mode variables are retained, so main/other builds do not switch login modes implicitly. The release configuration check refuses missing provider IDs or non-HTTPS endpoints.

The existing public privacy policy describes offline version 0.1.3. Before distributing a server-connected login build, its policy and Play Data safety disclosures must cover actual account, health/meal, location, photo/AI and synchronization processing. Preparing an AAB or configuring providers is not a Play submission. Real Google/Kakao native login, cancellation and account deletion on a physical device must be recorded separately from mocked/local tests.
