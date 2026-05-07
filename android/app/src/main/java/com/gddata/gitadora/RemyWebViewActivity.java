package com.gddata.gitadora;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

public class RemyWebViewActivity extends AppCompatActivity {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";

    private @Nullable WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String initialUrl = getIntent().getStringExtra(EXTRA_URL);

        if (!isHttpUrl(initialUrl)) {
            finish();
            return;
        }

        String title = getIntent().getStringExtra(EXTRA_TITLE);
        setTitle(title == null || title.trim().isEmpty() ? "RemyWiki" : title);

        WebView nextWebView = new WebView(this);
        webView = nextWebView;

        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.addView(
            nextWebView,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        setContentView(rootLayout);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(nextWebView, true);

        WebSettings settings = nextWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        nextWebView.setWebChromeClient(new WebChromeClient());
        nextWebView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                }

                @Override
                public boolean shouldOverrideUrlLoading(
                    WebView view,
                    @NonNull WebResourceRequest request
                ) {
                    String nextUrl = request.getUrl().toString();

                    if (!isHttpUrl(nextUrl)) {
                        return true;
                    }

                    return false;
                }

                @Override
                public void onReceivedSslError(
                    WebView view,
                    SslErrorHandler handler,
                    SslError error
                ) {
                    super.onReceivedSslError(view, handler, error);
                }
            }
        );

        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                            return;
                        }

                        finish();
                    }
                }
            );

        nextWebView.loadUrl(initialUrl);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }

    private static boolean isHttpUrl(String url) {
        if (url == null) {
            return false;
        }

        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();

        return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
    }
}
