# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# --- Capacitor / plugin reflection keeps (minifyEnabled = true) ------------
# Capacitor loads plugins and their @JavascriptInterface / @PluginMethod
# entry points reflectively, so their names must survive R8.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
    @com.getcapacitor.JSInject public *;
}
-keep class com.getcapacitor.community.database.sqlite.** { *; }
-keep class com.capacitorjs.plugins.** { *; }

# SQLCipher ships native bindings loaded by class name.
-keep class net.zetetic.** { *; }
-keep class net.sqlcipher.** { *; }

# SQLCipher pulls in Google Tink, whose compile-only annotations are not on the
# runtime classpath. R8 only needs to know they are safe to ignore.
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-dontwarn com.google.crypto.tink.**
-dontwarn com.google.api.client.**

# Keep annotations and generic signatures used by the bridge.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# WebView JavaScript interfaces.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
