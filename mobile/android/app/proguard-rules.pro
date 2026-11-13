# kotlinx.serialization: keep the generated serializers of the API's types.
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class app.lawfive.** {
    *** Companion;
}
-keepclasseswithmembers class app.lawfive.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class app.lawfive.schema.**$$serializer { *; }
# MapLibre
-dontwarn org.maplibre.**
# Garmin's Connect IQ companion SDK (APP-7) ships no rules of its own: its binder service, AIDL
# interfaces and parcelables are reached by Garmin Connect from outside the app.
-keep class com.garmin.** { *; }
-dontwarn com.garmin.**
