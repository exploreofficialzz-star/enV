plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.chastech.env"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.chastech.env"
        minSdk = 26
        targetSdk = 36
        buildConfigField("String", "ENV_API_BASE_URL", "\"${providers.gradleProperty("ENV_API_BASE_URL").orNull ?: "https://env-q3mq.onrender.com"}\"")
        buildConfigField("boolean", "ANALYTICS_ENABLED", providers.gradleProperty("envAnalyticsEnabled").orNull ?: "false")
        versionCode = 7
        versionName = "1.1.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }

    // Keep the canonical catalog in apps/shared; do not duplicate the 10,001 records.
    sourceSets["main"].assets.srcDir(file("../../shared"))
    sourceSets["test"].resources.srcDir(file("../../shared"))
    sourceSets["test"].resources.srcDir(file("../../../tests/fixtures"))
    // The game preview test needs a graphics-capable emulator; keep it separate from
    // the general Android suite, which also runs on SwiftShader-only emulators.
    if (providers.gradleProperty("envNativeGameTest").orNull == "true") {
        sourceSets["androidTest"].java.srcDir("src/gamePreviewTest/java")
    }

    val keystorePath = System.getenv("ANDROID_KEYSTORE_FILE")
    val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
    val keyAliasValue = System.getenv("ANDROID_KEY_ALIAS")
    val keyPasswordValue = System.getenv("ANDROID_KEY_PASSWORD")
    val releaseSigningValues = listOf(keystorePath, keystorePassword, keyAliasValue, keyPasswordValue)
    val hasReleaseKey = releaseSigningValues.all { !it.isNullOrBlank() }
    val hasPartialReleaseKey = releaseSigningValues.any { !it.isNullOrBlank() }
    val requiresProductionSigning = providers.gradleProperty("envRequireProductionSigning").orNull == "true"

    if (hasPartialReleaseKey && !hasReleaseKey) {
        throw GradleException("Android release signing is incomplete. Set ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD.")
    }
    if (requiresProductionSigning && !hasReleaseKey) {
        throw GradleException("This upload build requires the production Android signing keystore and all signing credentials.")
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = keystorePassword
                keyAlias = keyAliasValue
                keyPassword = keyPasswordValue
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseKey) signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.05.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.runtime:runtime-livedata")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("net.lingala.zip4j:zip4j:2.11.6")
    implementation("com.caverock:androidsvg-aar:1.4")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.camera:camera-camera2:1.4.2")
    implementation("androidx.camera:camera-lifecycle:1.4.2")
    implementation("androidx.camera:camera-video:1.4.2")
    implementation("androidx.camera:camera-view:1.4.2")
    implementation("androidx.media3:media3-common:1.5.1")
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-transformer:1.5.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.google.zxing:core:3.5.3")
    implementation("com.tom-roush:pdfbox-android:2.0.27.0")
    // Bundled on-device OCR model; no runtime model download or remote service.
    implementation("com.google.mlkit:text-recognition:16.0.1")
    implementation("com.google.android.gms:play-services-nearby:19.3.0")
    // The play preview uses the native Godot runtime, not a WebView.
    implementation("org.godotengine:godot:4.6.3.stable")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4-accessibility")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
