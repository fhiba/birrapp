# kotlinx.serialization: conservar los serializers generados.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.birrapp.data.model.** {
    *** Companion;
}
-keepclasseswithmembers class com.birrapp.data.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}
# Ktor
-dontwarn org.slf4j.**
-dontwarn io.ktor.**
