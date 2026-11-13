import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// WCH-1: the Wear OS watch app. The same kept-out-of-the-repo settings as the phone app's: another
// server to build in (lawfive.server), and a release signing key (lawfive.keystore).
val local = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

// VER-1: the version from git, as the phone's.
val version: List<String> = runCatching {
    providers.exec { commandLine(rootProject.file("../../tools/version.sh").path, "android") }
        .standardOutput.asText.get().trim().split(" ")
}.getOrNull()?.takeIf { it.size == 3 } ?: listOf("dev", "unknown", "1")

android {
    namespace = "app.lawfive.wear"
    compileSdk = 37

    defaultConfig {
        // The phone app's id: Google Play ships a phone app and its watch app under one listing.
        applicationId = "app.lawfive"
        minSdk = 30
        targetSdk = 36
        // Google Play needs a watch build's code to differ from the phone's, with both in one listing.
        // The same count of commits, a million on, so it stays from git (VER-1) and only grows.
        versionCode = 1_000_000 + version[2].toInt()
        versionName = version[0]
        buildConfigField("String", "DEFAULT_SERVER", "\"${local.getProperty("lawfive.server", "https://api.lawfive.app")}\"")
    }

    signingConfigs {
        local.getProperty("lawfive.keystore")?.let { path ->
            create("release") {
                storeFile = file(path)
                storePassword = local.getProperty("lawfive.keystore.password")
                keyAlias = local.getProperty("lawfive.keystore.alias", "lawfive")
                keyPassword = local.getProperty("lawfive.keystore.password")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    // WCH-2: the match rules' shared cases, for the tests.
    sourceSets["test"].kotlin.directories.add("../../../schema/generated/kotlin-tests")
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.wear.ongoing)
    implementation(libs.wear.input)
    implementation(libs.health.services)
    implementation(libs.concurrent.futures)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    testImplementation(libs.junit)
}
