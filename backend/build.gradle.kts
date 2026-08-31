plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ktor)
}

group = "com.birrapp"
version = "0.1.0"

application {
    mainClass.set("com.birrapp.ApplicationKt")
}

kotlin { jvmToolchain(21) }

repositories { mavenCentral() }

dependencies {
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.netty)
    implementation(libs.ktor.server.contentneg)
    implementation(libs.ktor.serialization.json)
    implementation(libs.ktor.server.auth)
    implementation(libs.ktor.server.auth.jwt)
    implementation(libs.ktor.server.statuspages)
    implementation(libs.ktor.server.calllogging)
    implementation(libs.ktor.server.cors)
    implementation(libs.ktor.server.ratelimit)
    implementation(libs.ktor.server.defaultheaders)
    implementation(libs.ktor.client.cio)
    implementation(libs.ktor.client.contentneg)

    implementation(libs.logback)
    implementation(libs.hikari)
    implementation(libs.postgres)
    implementation(libs.flyway.core)
    runtimeOnly(libs.flyway.pg)
    implementation(libs.nimbus.jose)

    testImplementation(libs.kotlin.test)
    testImplementation(libs.ktor.server.testhost)
}

tasks.test { useJUnitPlatform() }
