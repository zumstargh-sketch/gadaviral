# Google Authentication — Configuration Guide (spec §13–16)

GADAVIRAL implements genuine **Google OAuth 2.0 / OpenID Connect**:

- Web → authorization-code flow (`/wp-json/gadaviral/v1/auth/google/url` →
  `/auth/google/callback`), state signed/validated server-side (single-use,
  10-minute transient). The callback exchanges the code server-side (client
  secret never reaches the browser) and 302s to the SPA at
  `/auth/google/complete?accessToken=…&refreshToken=…&isNew=…&needsProfile=…`.
- Android / Windows / any client → **ID-token flow**: the client obtains a
  Google `id_token` through Google's own UI, sends it to
  `POST /wp-json/gadaviral/v1/auth/google/idtoken`, and the plugin verifies the
  token against Google's public JWKS: RS256 signature, expiry, `iss`, `aud`
  (web + Android + desktop client IDs) and the stable `sub`. Google profile
  data supplied by clients is never trusted directly.
- **Account linking (§9):** an existing GADAVIRAL account whose *verified*
  email matches the Google identity is linked to it — one account, multiple
  sign-in methods. New users get a natural username suggestion (e.g.
  `nii_tetteh`, `naa_okailey_quaye_gh`) and their Google photo is stored and
  served everywhere the app shows avatars.

## 1. Google Cloud project

1. <https://console.cloud.google.com> → create project **GADAVIRAL**.
2. **APIs & Services → OAuth consent screen**
   - User type: External
   - App name: `GADAVIRAL`, support email, homepage `https://www.gadaviral.com`
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - Add test users while in "Testing" mode; publish when ready.

## 2. OAuth credentials (per platform)

**Web application** (`gadv_google_client_id` / `gadv_google_client_secret`)
- Authorized JavaScript origins:
  - `https://www.gadaviral.com`
  - `https://gadaviral.com`
  - `https://staging.gadaviral.com` (staging tests)
  - `http://localhost:5173` (dev website)
- Authorized redirect URIs (the plugin builds its own callback URL per site):
  - `https://www.gadaviral.com/wp-json/gadaviral/v1/auth/google/callback`
  - `https://gadaviral.com/wp-json/gadaviral/v1/auth/google/callback`
  - `https://staging.gadaviral.com/wp-json/gadaviral/v1/auth/google/callback`

**Android** (`gadv_google_android_client_id`)
- Package name: `com.gadaviral.app`
- Add SHA-1 (and SHA-256) of your signing key:
  `keytool -list -v -keystore your.keystore -alias youralias`
  (debug keystore: `%USERPROFILE%\.android\debug.keystore`, password `android`)
- The Android client has **no** redirect URI (ID-token flow).

**Desktop / Windows** (`gadv_google_desktop_client_id`)
- Type: Desktop app. No SHA needed. Used only if you later switch the Windows
  app to a native OAuth loop; the current WebView shell uses the web flow.

## 3. Where the credentials go (WordPress)

WP Admin → **Settings → GADAVIRAL Google Sign-in** — paste the Web client ID
and secret (the page also shows the exact redirect URI to register in Google
Console). Optional: Android and Desktop client IDs (audiences for the ID-token
flow). Storing nothing keeps Google sign-in disabled and the app shows a
helpful "not configured" message.

## 4. Android app wiring

1. Paste the **Web** client id (`GOOGLE_CLIENT_ID`) into
   `android/app/build.gradle.kts → GOOGLE_SERVER_CLIENT_ID`
   (the audience the backend checks AND the token's `aud` — the backend accepts
   all three registered audiences, so passing the web client id is standard
   "server-side mode" for `GoogleSignIn`).
2. Register the same SHA-1 under the **Android** OAuth client.
3. Rebuild: `gradlew assembleDebug`.

## 5. Test matrix (spec §96)

| Scenario | Expected |
|---|---|
| New Google user → sign-in | account created (verified email), username suggested, profile completion → feed |
| Same Google user again | same account, direct login |
| Email-registered user + Google (same verified email) | **one linked account**, `auth_provider=LINKED`, no duplicate |
| Unverified Google email | rejected (`GOOGLE_EMAIL_UNVERIFIED`) |
| Forged/expired token | rejected (`GOOGLE_TOKEN_INVALID`) |
| Google registration | role is always `USER` — never admin |
