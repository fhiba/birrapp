import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

/**
 * Los secretos viven en local.properties (gitignoreado), nunca en el repo.
 * Si falta alguno el build sigue: la app compila y arranca igual, y avisa en
 * pantalla qué falta. Preferimos eso a un build roto — así se puede trabajar
 * en todo lo demás antes de tener las credenciales de Google.
 */
val localProps = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
fun localProp(key: String, fallback: String = "REPLACE_ME"): String =
    (localProps.getProperty(key) ?: fallback).ifBlank { fallback }

/** Keystore de release. Si no está, el APK de release sale sin firmar en vez
 *  de romper el build — mismo criterio que con el resto de los secretos. */
val releaseKeystore = rootProject.file(localProp("RELEASE_STORE_FILE", "birrapp-release.jks"))

android {
    namespace = "com.birrapp"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.birrapp"
        minSdk = 26
        targetSdk = 37
        // Subir en cada build que se distribuye. versionCode tiene que
        // crecer siempre: Android rechaza instalar una versión con código
        // menor o igual al instalado.
        versionCode = 4
        versionName = "0.2.2"

        // La API key del mapa se inyecta al manifest como placeholder.
        manifestPlaceholders["MAPS_API_KEY"] = localProp("MAPS_API_KEY")

        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${localProp("GOOGLE_WEB_CLIENT_ID")}\"")
        buildConfigField("String", "API_BASE_URL", "\"${localProp("API_BASE_URL", "http://10.0.2.2:8090")}\"")
        // Permite avisar en pantalla en vez de dejar un mapa gris sin explicación.
        buildConfigField("boolean", "MAPS_KEY_MISSING", "${localProp("MAPS_API_KEY") == "REPLACE_ME"}")
        buildConfigField("boolean", "MAPS_API_KEY_PRESENT", "${localProp("MAPS_API_KEY") != "REPLACE_ME"}")
        buildConfigField("String", "MAPS_API_KEY", "\"${localProp("MAPS_API_KEY")}\"")
    }

    signingConfigs {
        if (releaseKeystore.exists()) {
            create("release") {
                storeFile = releaseKeystore
                storePassword = localProp("RELEASE_STORE_PASSWORD", "")
                keyAlias = localProp("RELEASE_KEY_ALIAS", "birrapp")
                keyPassword = localProp("RELEASE_KEY_PASSWORD", "")
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/INDEX.LIST")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.core.ktx)
    implementation(libs.lifecycle.runtime)
    implementation(libs.lifecycle.vm.compose)
    implementation(libs.activity.compose)
    implementation(libs.nav.compose)

    implementation(libs.compose.ui)
    implementation(libs.compose.graphics)
    implementation(libs.compose.material3)
    implementation(libs.compose.icons.core)
    implementation(libs.compose.tooling.prev)
    debugImplementation(libs.compose.tooling)

    implementation(libs.credentials)
    implementation(libs.credentials.play)
    implementation(libs.googleid)

    implementation(libs.maps.compose)
    implementation(libs.play.location)
    implementation(libs.places)
    implementation(libs.browser)
    implementation(libs.coroutines.play)

    implementation(libs.ktor.client.android)
    implementation(libs.ktor.client.contentneg)
    implementation(libs.ktor.serialization.json)
    implementation(libs.ktor.client.auth)
    implementation(libs.ktor.client.logging)

    implementation(libs.datastore.prefs)
    implementation(libs.haze)
    implementation(libs.haze.materials)
}
