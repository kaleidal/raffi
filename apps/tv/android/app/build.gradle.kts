plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "al.kaleid.raffi"
    compileSdk = 37

    defaultConfig {
        applicationId = "al.kaleid.raffi"
        minSdk = 28
        targetSdk = 37
        versionCode = 1
        versionName = "0.15.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }

    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    jvmToolchain(25)
}

dependencies {
    implementation(libs.androidx.activity)
    implementation(libs.androidx.core)
    implementation(libs.androidx.webkit)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.ui)
}
