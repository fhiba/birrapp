# Build en dos etapas: la imagen final no lleva Gradle ni el código fuente.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
# Primero sólo lo necesario para resolver dependencias: si no cambian, esta
# capa se reutiliza y el build es mucho más rápido.
COPY gradle gradle
COPY gradlew settings.gradle.kts build.gradle.kts ./
RUN ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true
COPY src src
RUN ./gradlew --no-daemon buildFatJar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/build/libs/birrapp-backend-all.jar app.jar

# La plataforma inyecta PORT; el default cubre el caso local.
ENV PORT=8090
ENV BIND_HOST=0.0.0.0
EXPOSE 8090

# Sin usuario root: si alguien logra ejecución, que no sea como root.
RUN useradd -r -u 10001 birrapp
USER birrapp

# MaxRAMPercentage en vez de -Xmx fijo: la JVM se adapta al límite del
# contenedor, que cambia según el plan que se contrate.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
