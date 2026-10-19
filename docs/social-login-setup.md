# FitDoing Google / Kakao sign-in

The app uses native Google and Kakao SDKs, with provider tokens verified by its own Go server. Google ID tokens are checked against provider public keys, issuer, audience and expiry. Kakao access tokens are checked with Kakao and must belong to app 1604237. No account linking by email or display name is performed.

The core and user React Native modules use version 3.0.0, which declares Kakao Android SDK 2.25.0 and supports its removed legacy APIs. This follows Kakao's [2026-08-18 security/stability update](https://devtalk.kakao.com/t/151205), which covers native Android SDK versions 2.24.0 and below. Versions are pinned through the lockfile, with no native SDK metadata override or generated Android files edited by hand.

## Configuration

- App/build: `EXPO_PUBLIC_API_URL=https://fitdoing.kodeploy.com`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`. `EXPO_PUBLIC_AUTH_DISABLED=0` enables mandatory sign-in in the new build.
- iOS source configuration additionally supports `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. It generates the reversed client-ID URL scheme. This does not mean an iOS binary has been built or submitted.
- Server: existing `AUTH_SECRET` remains unchanged; set `GOOGLE_CLIENT_IDS` to the web client ID and `KAKAO_APP_ID=1604237`. Google client secrets and Kakao Admin secrets are not needed for this native token-verification flow. Never embed those secrets in the app.
- Register `com.fitdoing.app` and the actual Play app-signing SHA-1 in a Google Android OAuth client. Kakao needs the matching certificate SHA-1 encoded as Base64. Register upload/debug certificates separately if those builds need login; never substitute an upload certificate for Play app signing.
- `GET /api/auth/providers` returns configuration booleans only. A true value proves server configuration, not a real user sign-in.

## Kakao account events and deletion

`POST /api/auth/kakao/events` accepts Kakao SETs (`application/secevent+jwt`). It checks RS256 signatures against the fixed Kakao JWKS endpoint, the exact issuer, the primary REST-key audience, the app ID when provided, event timestamps and member subject. Only OAuth User Unlinked and Tokens Revoked need to be subscribed; no Admin key, RISC/CAEP permissions or additional personal-information scopes are used. Validation failures use RFC 8935 errors. Delivery/network/database failures are retried by the sender, while successful persistence is acknowledged with 202 within the request deadline.

Token revocation increments the account's session version. An unlinked Kakao-only account is blocked immediately and durably queued for data/file deletion. Other linked providers, if present, keep their data while the Kakao identity is removed. Hashed event receipts prevent replay and are automatically removed after 30 days. A delayed event for an older account does not target a subsequently recreated account. Unprocessed cleanup requests survive restarts; failed storage deletion retries with backoff up to one hour and is never silently discarded.

Authenticated account deletion also blocks access and retains a durable cleanup request before touching files. The existing 204 response means account access is removed; storage cleanup can remain queued during a provider outage. Replaced photos, uncertain upload outcomes and in-flight uploads are tracked until their objects are removed. R2/FileStore account cleanup lists only `u/<internal-user-id>/`, including old unreferenced objects. A startup capability check uses one newly generated, non-user probe object; it never deletes an existing user's data. This does not verify the hosting provider's log/backup retention or backup-restore deletion replay.

Provider-side consent removal initiated from the app itself is a separate client-side unlink step and is not claimed as verified by these incoming-webhook checks. Physical login, real external unlink delivery and the connected-build privacy/Data safety disclosures still need checking before store distribution.

## Existing test records

The currently configured `AUTH_DISABLED=1` compatibility mode accepts old random per-install device tokens and verifies real signed sessions separately. Invalid signed sessions never fall back to anonymous access. Do not change the existing server secret when adding providers.

After successful provider verification, the new app can prove possession of its saved device token. The server links that existing anonymous user to a previously unbound provider identity in a transaction; records and user ID remain unchanged. The old anonymous token is retired using a digest that survives account deletion. Unrelated users and shared historical `dev-user` records are never claimed or merged. An identity already attached to a different account returns 409 before the app changes its local data. Unknown/offline-only installations can upload their local records to a new provider account. If that provider already belongs to an existing account, the upgrade pauses with 409 so local records cannot overwrite that account.

Legacy schemas are now refused at startup without dropping tables. A reviewed migration is required if such a schema exists. No production data should be erased to enable login.

## Build and release boundaries

For a signed AAB without Play upload, dispatch `CD: Android Play Store` from this branch with `dry_run=true`, `enable_social_login=true`, and an appropriate version name. Existing global test-mode variables are retained, so main/other builds do not switch login modes implicitly. The release configuration check refuses missing provider IDs or non-HTTPS endpoints.

The existing public privacy policy describes offline version 0.1.3. Before distributing a server-connected login build, its policy and Play Data safety disclosures must cover actual account, health/meal, location, photo/AI and synchronization processing. Preparing an AAB or configuring providers is not a Play submission. Real Google/Kakao native login, cancellation and account deletion on a physical device must be recorded separately from mocked/local tests.
