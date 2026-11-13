import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

// Kept out of the repo: the SDK's place, another server to build in instead of the hosted service
// (lawfive.server, like the watch's --server), a release signing key (lawfive.keystore, .password, .alias), and for testing the
// watch through the phone in debug builds, lawfive.ciq.tethered=true (the Connect IQ simulator); and
// for notifications (PUSH-5), the Firebase app's lawfive.firebase.appId, .apiKey, .projectId and .senderId.
val local = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

// VER-1: the version from git (tools/version.sh android): "2026.10.30", the commit, and a build
// number that only grows, for versionCode. Nobody bumps it by hand.
val version: List<String> = runCatching {
    providers.exec { commandLine(rootProject.file("../../tools/version.sh").path, "android") }
        .standardOutput.asText.get().trim().split(" ")
}.getOrNull()?.takeIf { it.size == 3 } ?: listOf("dev", "unknown", "1")

android {
    namespace = "app.lawfive"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.lawfive"
        minSdk = 29
        targetSdk = 37
        versionCode = version[2].toInt()
        versionName = version[0]
        buildConfigField("String", "COMMIT", "\"${version[1]}\"")
        buildConfigField("String", "DEFAULT_SERVER", "\"${local.getProperty("lawfive.server", "https://api.lawfive.app")}\"")
        // PUSH-5: without a Firebase app, the build simply doesn't offer notifications from the server.
        for ((field, key) in listOf("FIREBASE_APP_ID" to "appId", "FIREBASE_API_KEY" to "apiKey", "FIREBASE_PROJECT_ID" to "projectId", "FIREBASE_SENDER_ID" to "senderId")) {
            buildConfigField("String", field, "\"${local.getProperty("lawfive.firebase.$key", "")}\"")
        }
        buildConfigField("String", "PUSH_RELAY", "\"${local.getProperty("lawfive.push.relay", "https://push.lawfive.app")}\"")
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
        debug {
            // APP-7: talk to the Connect IQ simulator over adb instead of a watch (lawfive.ciq.tethered=true).
            buildConfigField("boolean", "CIQ_TETHERED", local.getProperty("lawfive.ciq.tethered", "false"))
        }
        release {
            buildConfigField("boolean", "CIQ_TETHERED", "false")
            isMinifyEnabled = true
            isShrinkResources = true
            // 64-bit ARM only (every Android 10+ phone it's for, the Pixel among them): MapLibre's
            // native code for each other kind would more than double the download.
            ndk { abiFilters += "arm64-v8a" }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // The API's types, generated from schema/ (pnpm generate there).
    sourceSets["main"].kotlin.directories.add("../../../schema/generated/kotlin")
    // WCH-2: the match rules' shared cases, for the tests.
    sourceSets["test"].kotlin.directories.add("../../../schema/generated/kotlin-tests")
    // The quiz's questions, built in for no signal (QUIZ-1).
    sourceSets["main"].assets.directories.add("../../../schema/quiz")
    // The misconduct codes (ifab.json, ussf.json, fa.json), for correcting a result (RES-1).
    sourceSets["main"].assets.directories.add("../../../schema/misconduct")
    // The shared sample data (the demo account and a new one), for the snapshot tests and their decoding test.
    sourceSets["test"].resources.directories.add("../../../schema/generated/fixtures")

    // The snapshot tests run on Robolectric, which draws with Android's own code and needs the app's
    // resources (its fonts among them).
    testOptions.unitTests.isIncludeAndroidResources = true
}

// The snapshot tests (app.lawfive.snapshots, mobile/android/README.md#snapshot-tests) are for review: they write
// every picture each run (Roborazzi's record) and never compare, so a changed picture never fails the
// build. They go to mobile/android/build/snapshots/, and run with the debug build's tests only, so
// `./gradlew test` draws them once. Alone: ./gradlew :app:testDebugUnitTest --tests 'app.lawfive.snapshots.*'
tasks.withType<Test>().configureEach {
    if (name.contains("Release")) {
        filter.excludeTestsMatching("app.lawfive.snapshots.*")
    } else {
        systemProperty("roborazzi.test.record", "true")
        systemProperty("lawfive.snapshots", rootProject.layout.buildDirectory.dir("snapshots").get().asFile.path)
        // -Plawfive.snapshots.only=matches,stats draws those screens alone.
        providers.gradleProperty("lawfive.snapshots.only").orNull?.let { systemProperty("lawfive.snapshots.only", it) }
        // Tall pages drawn whole take room.
        maxHeapSize = "2g"
        // Robolectric's SDK 37 reaches into the JDK's file descriptors (robolectric.org/getting-started).
        jvmArgs("--add-exports=java.base/jdk.internal.access=ALL-UNNAMED", "--add-opens=java.base/jdk.internal.access=ALL-UNNAMED", "--add-opens=java.base/java.io=ALL-UNNAMED")
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.health.connect)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.exifinterface)
    implementation(libs.androidx.browser)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.maplibre)
    implementation(libs.connectiq)
    implementation(libs.play.code.scanner)
    implementation(libs.firebase.messaging)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testImplementation(libs.espresso.core)
    testImplementation(libs.okhttp.mockwebserver)
}
