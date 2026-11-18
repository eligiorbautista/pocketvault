package com.pocketvault.app;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.util.Set;

public class MainActivity extends BridgeActivity {
    private static final Set<String> SHORTCUT_HOSTS = Set.of("income", "expenses", "debts", "wallet");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Must be registered before super.onCreate so the bridge includes it.
        registerPlugin(BiometricPlugin.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.BLACK);

        // Keep the status bar visible, but inset the WebView below it. Capacitor's
        // WebView does not expose safe-area insets to CSS on Android, so padding
        // the content view is the reliable guard against overlap.
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        controller.show(WindowInsetsCompat.Type.statusBars());
        controller.setAppearanceLightStatusBars(false);
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
        ViewCompat.requestApplyInsets(content);

        handleShortcut(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShortcut(intent);
    }

    // Capacitor's appUrlOpen did not consistently reach the renderer after a
    // cold start/lock, so route the approved shortcut directly into the hash
    // router. This also works while the app is still on the LockScreen.
    private void handleShortcut(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri data = intent.getData();
        if (data == null || !"pocketvault".equals(data.getScheme())) return;
        String host = data.getHost();
        if (host == null || !SHORTCUT_HOSTS.contains(host)) return;

        String route = "/" + host + (data.getQuery() == null ? "" : "?" + data.getQuery());
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;
        applyRoute(webView, route, 25);
    }

    private void applyRoute(WebView webView, String route, int attemptsLeft) {
        // Wait for the page itself, not just the WebView URL: on a cold start the
        // URL is set while the React app is still loading, and a hash written
        // too early is discarded by the initial navigation.
        if (webView.getProgress() >= 100) {
            String hash = JSONObject.quote("#" + route);
            String script =
                "(function(){var n=0;function go(){if(document.getElementById('root'))" +
                "{window.location.hash=" + hash + ";return;}if(n++<50)setTimeout(go,100);}go();})()";
            webView.evaluateJavascript(script, null);
            return;
        }
        if (attemptsLeft > 0) {
            webView.postDelayed(() -> applyRoute(webView, route, attemptsLeft - 1), 200);
        }
    }
}
