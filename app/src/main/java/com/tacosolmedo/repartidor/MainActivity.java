package com.tacosolmedo.repartidor;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.GeolocationPermissions;
import android.content.pm.ActivityInfo;
import android.widget.Toast;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Portrait fijo (app de repartidor, una mano)
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        webView = new WebView(this);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);          // localStorage de la PWA
        ws.setDatabaseEnabled(true);
        ws.setGeolocationEnabled(true);        // GPS del repartidor
        ws.setAllowFileAccess(true);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setMediaPlaybackRequiresUserGesture(false);

        // Mantener navegación dentro del WebView (no abrir navegador externo para rutas/links)
        webView.setWebViewClient(new WebViewClient());

        // Permitir GPS y permisos de geolocalización desde la web
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, true);
            }
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        request.grant(request.getResources());
                    }
                });
            }
        });

        setContentView(webView);

        // Cargar la app del repartidor desde los assets (offline, sin servidor)
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
