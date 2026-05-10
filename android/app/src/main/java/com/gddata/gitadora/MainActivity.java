package com.gddata.gitadora;

import android.os.Build;
import android.util.Log;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.lang.reflect.Method;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int ANDROID_15_API_LEVEL = 35;
    private static final float REQUESTED_HIGH_FRAME_RATE = 120f;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BjmaniaAuthPlugin.class);
        registerPlugin(BjmaniaApiPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(ImageSaverPlugin.class);
        registerPlugin(NativeWebViewPlugin.class);
        super.onCreate(savedInstanceState);

        configureBridgeWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        configureBridgeWebView();
    }

    private void configureBridgeWebView() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        WebView webView = getBridge().getWebView();
        webView.getSettings().setTextZoom(100);
        requestHighFrameRate(webView);
        requestHighFrameRate(getWindow().getDecorView());
        webView.post(() -> requestHighFrameRate(webView));
    }

    private void requestHighFrameRate(View view) {
        if (view == null || Build.VERSION.SDK_INT < ANDROID_15_API_LEVEL) {
            return;
        }

        try {
            Method method = View.class.getMethod("setRequestedFrameRate", float.class);
            method.invoke(view, REQUESTED_HIGH_FRAME_RATE);
        } catch (ReflectiveOperationException exception) {
            Log.w(TAG, "Unable to request high frame rate", exception);
        }
    }
}
