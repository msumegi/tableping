package com.rangeroadtech.tabletrade;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private String safeAreaJs = "";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NearbyPlugin.class);
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attrs = window.getAttributes();
            attrs.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attrs);
        }
        View webView = findViewById(com.getcapacitor.android.R.id.webview);
        if (webView != null) {
            ViewGroup.LayoutParams params = webView.getLayoutParams();
            params.width = ViewGroup.LayoutParams.MATCH_PARENT;
            params.height = ViewGroup.LayoutParams.MATCH_PARENT;
            webView.setLayoutParams(params);
        }
        ViewCompat.setOnApplyWindowInsetsListener(window.getDecorView(), (view, insets) -> {
            publishSafeArea(insets);
            return insets;
        });
        if (getBridge() != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView view) {
                    applySafeAreaJs();
                    view.postDelayed(() -> applySafeAreaJs(), 300);
                    view.postDelayed(() -> republishFromWindow(), 800);
                }

                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    applySafeAreaJs();
                }
            });
        }
        ViewCompat.requestApplyInsets(window.getDecorView());
    }

    @Override
    public void onResume() {
        super.onResume();
        republishFromWindow();
    }

    private void republishFromWindow() {
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
        if (insets != null) publishSafeArea(insets);
    }

    private void publishSafeArea(WindowInsetsCompat insets) {
        Insets bars = insets.getInsets(
            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
        );
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;
        safeAreaJs = String.format(
            Locale.US,
            "document.documentElement.style.setProperty('--safe-top','%.2fpx');" +
                "document.documentElement.style.setProperty('--safe-right','%.2fpx');" +
                "document.documentElement.style.setProperty('--safe-bottom','%.2fpx');" +
                "document.documentElement.style.setProperty('--safe-left','%.2fpx');",
            bars.top / density,
            bars.right / density,
            bars.bottom / density,
            bars.left / density
        );
        applySafeAreaJs();
    }

    private void applySafeAreaJs() {
        if (safeAreaJs.isEmpty() || getBridge() == null || getBridge().getWebView() == null) return;
        String js = "(function(){try{" + safeAreaJs + "}catch(e){}})();";
        getBridge().getWebView().post(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(js, null);
            }
        });
    }
}
