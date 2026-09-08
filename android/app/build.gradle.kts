// API base URL — override per build with:
//   gradlew -PAPI_BASE_URL=https://your-host.example assembleDebug
// Defaults to the production site; debug builds fall back to the emulator host.
val apiBaseUrl = (project.findProperty("API_BASE_URL") as String?) ?: "https://www.gadaviral.com"
val googleServerClientId = (project.findProperty("GOOGLE_SERVER_CLIENT_ID") as String?) ?: ""

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.gadaviral.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.gadaviral.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        // Same backend as the website and the Windows app.
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        // Google OAuth: server (web) client ID that the backend verifies.
        buildConfigField("String", "GOOGLE_SERVER_CLIENT_ID", "\"$googleServerClientId\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
        debug {
            // Emulator default (10.0.2.2 = host loopback) unless -PAPI_BASE_URL was given
            if (project.findProperty("API_BASE_URL") == null) {
                buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000\"")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.google.android.gms:play-services-auth:21.2.0")
    implementation("org.json:json:20240303")
}

