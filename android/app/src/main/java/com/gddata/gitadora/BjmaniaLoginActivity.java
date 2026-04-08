package com.gddata.gitadora;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import java.io.IOException;

public class BjmaniaLoginActivity extends AppCompatActivity {

    public static final String EXTRA_SUCCESS = "success";
    public static final String EXTRA_CANCELLED = "cancelled";

    private static final String BASE_URL = BjmaniaSessionManager.BASE_URL;
    private static final String LOGIN_URL = BASE_URL + "/login";
    private static final String TAG = "BjmaniaLogin";
    private static final long VERIFY_DELAY_MS = 450L;
    private static final long EXIT_RETRY_DELAY_MS = 800L;
    private static final int EXIT_VERIFY_RETRY_COUNT = 4;
    private static final long AUTO_VERIFY_INTERVAL_MS = 1200L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable scheduledVerifyRunnable = this::verifyLoginStateSoonInternal;
    private final Runnable autoVerifyRunnable = this::autoVerifyLoop;
    private @Nullable WebView webView;
    private @Nullable String currentUrl;
    private @Nullable BjmaniaSessionManager sessionManager;
    private volatile boolean finishingResult = false;
    private volatile boolean verifyInFlight = false;
    private volatile boolean activeProbeExitOnFailure = false;
    private volatile int activeProbeRemainingAttempts = 0;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("BJMANIA Login");
        sessionManager = BjmaniaSessionManager.getInstance(this);
        if (sessionManager != null) {
            sessionManager.setReferer(LOGIN_URL);
        }

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
        settings.setSupportZoom(false);
        settings.setTextZoom(100);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        if (sessionManager != null) {
            sessionManager.setUserAgent(settings.getUserAgentString());
        }

        nextWebView.setWebChromeClient(new WebChromeClient());
        nextWebView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                    currentUrl = url;
                    if (sessionManager != null) {
                        sessionManager.setReferer(url);
                    }
                    Log.d(TAG, "onPageStarted url=" + url);
                    updateStatusForCurrentPage(url);
                    verifyLoginStateSoon();
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    currentUrl = url;
                    if (sessionManager != null) {
                        sessionManager.setReferer(url);
                    }
                    Log.d(TAG, "onPageFinished url=" + url);
                    updateStatusForCurrentPage(url);
                    verifyLoginStateSoon();
                }

                @Override
                public void onReceivedError(
                    WebView view,
                    @NonNull WebResourceRequest request,
                    @NonNull WebResourceError error
                ) {
                    super.onReceivedError(view, request, error);
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
                            Log.d(TAG, "Back pressed: navigating WebView history");
                            webView.goBack();
                            return;
                        }

                        Log.d(TAG, "Back pressed with no WebView history, attempting final auth verification");
                        verifyLoginStateBeforeExit(EXIT_VERIFY_RETRY_COUNT);
                    }
                }
            );

        attemptSessionRestoreOrLoadLogin();
    }

    private void attemptSessionRestoreOrLoadLogin() {
        if (sessionManager == null || !sessionManager.hasWebViewCookies()) {
            loadLoginPage();
            return;
        }

        updateStatus("Checking saved BJMANIA session...");

        new Thread(
                () -> {
                    try {
                        BjmaniaSessionManager.AuthCheckResult result =
                            sessionManager.probeAuthMeWithWebViewCookies();
                        handleRestoreProbeResult(result, null);
                    } catch (IOException exception) {
                        handleRestoreProbeResult(null, exception);
                    }
                }
            )
            .start();
    }

    private void handleRestoreProbeResult(
        @Nullable BjmaniaSessionManager.AuthCheckResult probeResult,
        @Nullable IOException exception
    ) {
        runOnUiThread(
            () -> {
                if (finishingResult) {
                    return;
                }

                if (exception != null) {
                    Log.d(TAG, "restoreProbe failed error=" + exception.getMessage());
                    loadLoginPage();
                    return;
                }

                if (probeResult != null) {
                    Log.d(
                        TAG,
                        "restoreProbe status=" +
                        probeResult.statusCode +
                        " cookieLength=" +
                        probeResult.cookieLength +
                        " hadCookie=" +
                        probeResult.hadCookie
                    );
                }

                if (probeResult != null && probeResult.success) {
                    finishSuccess();
                    return;
                }

                loadLoginPage();
            }
        );
    }

    private void loadLoginPage() {
        updateStatus("Preparing BJMANIA login...");

        if (sessionManager != null) {
            sessionManager.clearNativeSession();
        }

        if (webView != null) {
            webView.clearHistory();
            webView.clearCache(true);
            webView.clearFormData();
        }

        mainHandler.post(
            () -> {
                if (webView == null || finishingResult) {
                    return;
                }

                currentUrl = LOGIN_URL;
                if (sessionManager != null) {
                    sessionManager.setReferer(LOGIN_URL);
                }
                webView.loadUrl(LOGIN_URL);
                scheduleAutoVerify(AUTO_VERIFY_INTERVAL_MS);
            }
        );
    }

    private void verifyLoginStateSoon() {
        mainHandler.removeCallbacks(scheduledVerifyRunnable);
        mainHandler.postDelayed(scheduledVerifyRunnable, VERIFY_DELAY_MS);
    }

    private void autoVerifyLoop() {
        verifyLoginState(false, 0);
    }

    private void scheduleAutoVerify(long delayMs) {
        mainHandler.removeCallbacks(autoVerifyRunnable);
        mainHandler.postDelayed(autoVerifyRunnable, delayMs);
    }

    private void verifyLoginStateSoonInternal() {
        verifyLoginState(false, 0);
    }

    private void verifyLoginStateBeforeExit(int remainingAttempts) {
        verifyLoginState(true, remainingAttempts);
    }

    private void verifyLoginState(boolean exitOnFailure, int remainingAttempts) {
        if (finishingResult) {
            return;
        }

        Log.d(
            TAG,
            "verifyLoginState exitOnFailure=" +
            exitOnFailure +
            " remainingAttempts=" +
            remainingAttempts +
            " currentUrl=" +
            currentUrl
        );

        if (verifyInFlight) {
            if (exitOnFailure && remainingAttempts > 0) {
                updateStatus("Confirming BJMANIA session...");
                scheduleExitVerificationRetry(remainingAttempts - 1);
            } else if (!exitOnFailure) {
                scheduleAutoVerify(AUTO_VERIFY_INTERVAL_MS);
            }

            return;
        }

        if (webView == null || sessionManager == null) {
            if (exitOnFailure) {
                finishCancelled();
            }
            return;
        }

        verifyInFlight = true;
        activeProbeExitOnFailure = exitOnFailure;
        activeProbeRemainingAttempts = remainingAttempts;
        updateStatus("Confirming BJMANIA session...");

        new Thread(
                () -> {
                    try {
                        BjmaniaSessionManager.AuthCheckResult result =
                            sessionManager.probeAuthMeWithWebViewCookies();
                        handleProbeResult(result, null);
                    } catch (IOException exception) {
                        handleProbeResult(null, exception);
                    }
                }
            )
            .start();
    }

    private void handleProbeResult(
        @Nullable BjmaniaSessionManager.AuthCheckResult probeResult,
        @Nullable IOException exception
    ) {
        runOnUiThread(
            () -> {
                verifyInFlight = false;

                if (exception != null) {
                    Log.d(TAG, "probeAuthMeWithCookieManager failed error=" + exception.getMessage());

                    if (activeProbeExitOnFailure && activeProbeRemainingAttempts > 0) {
                        scheduleExitVerificationRetry(activeProbeRemainingAttempts - 1);
                        return;
                    }

                    if (activeProbeExitOnFailure) {
                        finishCancelled();
                        return;
                    }

                    updateStatusForCurrentPage(currentUrl);
                    scheduleAutoVerify(AUTO_VERIFY_INTERVAL_MS);
                    return;
                }

                if (probeResult == null) {
                    if (activeProbeExitOnFailure) {
                        finishCancelled();
                    } else {
                        updateStatusForCurrentPage(currentUrl);
                        scheduleAutoVerify(AUTO_VERIFY_INTERVAL_MS);
                    }
                    return;
                }

                Log.d(
                    TAG,
                    "probeAuthMeWithCookieManager status=" +
                    probeResult.statusCode +
                    " cookieLength=" +
                    probeResult.cookieLength +
                    " hadCookie=" +
                    probeResult.hadCookie +
                    " currentUrl=" +
                    currentUrl
                );

                if (probeResult.success) {
                    finishSuccess();
                    return;
                }

                if (activeProbeExitOnFailure && activeProbeRemainingAttempts > 0) {
                    scheduleExitVerificationRetry(activeProbeRemainingAttempts - 1);
                    return;
                }

                if (activeProbeExitOnFailure) {
                    finishCancelled();
                    return;
                }

                updateStatusForCurrentPage(currentUrl);
                scheduleAutoVerify(AUTO_VERIFY_INTERVAL_MS);
            }
        );
    }

    private void scheduleExitVerificationRetry(int remainingAttempts) {
        mainHandler.removeCallbacks(scheduledVerifyRunnable);
        mainHandler.postDelayed(
            () -> verifyLoginStateBeforeExit(remainingAttempts),
            EXIT_RETRY_DELAY_MS
        );
    }

    private void finishSuccess() {
        if (finishingResult) {
            return;
        }

        Log.d(TAG, "finishSuccess");
        finishingResult = true;

        Intent data = new Intent();
        data.putExtra(EXTRA_SUCCESS, true);
        data.putExtra(EXTRA_CANCELLED, false);
        setResult(Activity.RESULT_OK, data);
        finish();
    }

    private void finishCancelled() {
        if (finishingResult) {
            return;
        }

        Log.d(TAG, "finishCancelled currentUrl=" + currentUrl);
        finishingResult = true;
        Intent data = new Intent();
        data.putExtra(EXTRA_SUCCESS, false);
        data.putExtra(EXTRA_CANCELLED, true);
        setResult(Activity.RESULT_CANCELED, data);
        finish();
    }

    private void updateStatusForCurrentPage(@Nullable String url) {
        // Login status overlay removed.
    }

    private void updateStatus(String message) {
        // Login status overlay removed; keep call sites as no-ops.
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);

        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }
}
