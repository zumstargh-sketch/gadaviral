# GADAVIRAL Android App

Native Kotlin sign-in (email + genuine Google Sign-In) on top of the shared
GADAVIRAL backend, with the full app experience served in a secure WebView
(same SPA as the website — one backend, one database, all platforms).

## Build

```powershell
cd android
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
gradlew.bat assembleDebug          # → app\build\outputs\apk\debug\app-debug.apk
gradlew.bat assembleRelease        # signed release (configure signing below)
```

First build downloads the Android SDK components automatically (licenses are
pre-accepted in `%LOCALAPPDATA%\Android\Sdk\licenses`).

## Backend URL (important!)

- Default: `https://www.gadaviral.com` (release + debug, unless overridden).
- Debug without a property: `http://10.0.2.2:4000` — **emulator only**; a real
  phone cannot reach 10.0.2.2 (it is the emulator's alias for your PC).
- **Real phone / custom host:** pass the backend URL at build time:

```powershell
gradlew.bat -PAPI_BASE_URL=https://app.gadaviral.com assembleDebug
# phone testing without hosting (PC + tunnel):
powershell -File ..\scripts\tunnel.ps1     # prints a public https URL
gradlew.bat -PAPI_BASE_URL=<that-url> assembleDebug
copy app\build\outputs\apk\debug\app-debug.apk ..\GADAVIRAL.apk
```

The phone app shows the full GADAVIRAL experience because the backend serves
the website SPA on its own origin (`/`), plus the native login screens.

Google sign-in additionally needs `GOOGLE_SERVER_CLIENT_ID`:

```powershell
gradlew.bat -PAPI_BASE_URL=... -PGOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com assembleDebug
```

plus the SHA-1 of your signing key registered in the Google Cloud console (see
`docs/GOOGLE-AUTH-SETUP.md`). Without it the Google button explains that
sign-in is not configured in the build — email login works regardless.

Signing for release (`android/app/build.gradle.kts` or `~/.gradle/gradle.properties`):

```groovy
signingConfigs {
    release {
        storeFile file("gadaviral-release.keystore")
        storePassword "…"
        keyAlias "gadaviral"
        keyPassword "…"
    }
}
```

Register the keystore SHA-1 in the Google Cloud console for Google sign-in.

## App structure

- `SplashActivity` — branded splash (spec §1) → Login or Main depending on session
- `LoginActivity` — email/password + **Continue with Google** (GoogleSignIn ID-token → `/auth/google/idtoken`)
- `RegisterActivity` — email registration → `VerifyActivity`
- `VerifyActivity` — 6-digit OTP + resend cooldown (emails come from `admin@gadaviral.com`)
- `ForgotPasswordActivity` — reset link request (opens in browser/deep-link)
- `MainActivity` — secure WebView hosting the SPA; native session injected into
  the app's token store, so feed/posts/messaging/etc. are fully functional and
  synchronized with every other platform.
- `Session` — EncryptedSharedPreferences token storage

Deep link: `gadaviral://auth/...` handled by `GoogleCallbackActivity`.
