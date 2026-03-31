package com.gddata.gitadora;

import android.content.Context;
import android.net.Uri;
import android.text.TextUtils;
import android.webkit.CookieManager;
import androidx.annotation.Nullable;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import okhttp3.Cookie;
import okhttp3.HttpUrl;
import okhttp3.Interceptor;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public final class BjmaniaSessionManager {

    public static final String BASE_URL = "https://u.bjmania.com";
    public static final String HOST = "u.bjmania.com";
    private static final String DEFAULT_REFERER = BASE_URL + "/";
    private static final String XSRF_COOKIE_NAME = "XSRF-TOKEN";

    private static BjmaniaSessionManager instance;

    private final CookieManager webViewCookieManager;
    private final BjmaniaCookieJar cookieJar;
    private final OkHttpClient client;
    private final OkHttpClient probeClient;
    private @Nullable String userAgent;
    private @Nullable String referer;

    private BjmaniaSessionManager(Context context) {
        webViewCookieManager = CookieManager.getInstance();
        cookieJar = new BjmaniaCookieJar();

        Interceptor requestContextInterceptor = chain -> {
            Request request = chain.request();
            Request.Builder builder = request.newBuilder();
            String currentUserAgent = getUserAgent();
            String currentReferer = getReferer();

            if (!TextUtils.isEmpty(currentUserAgent) && request.header("User-Agent") == null) {
                builder.header("User-Agent", currentUserAgent);
            }

            // BJMANIA rejects auth/session probes without a same-origin Referer.
            if (
                HOST.equals(request.url().host()) &&
                !TextUtils.isEmpty(currentReferer) &&
                request.header("Referer") == null
            ) {
                builder.header("Referer", currentReferer);
            }

            if (
                HOST.equals(request.url().host()) &&
                requiresCsrfHeaders(request.method()) &&
                request.header("X-Requested-With") == null
            ) {
                builder.header("X-Requested-With", "XMLHttpRequest");
            }

            if (
                HOST.equals(request.url().host()) &&
                requiresCsrfHeaders(request.method()) &&
                request.header("X-XSRF-TOKEN") == null
            ) {
                String xsrfToken = getXsrfToken();
                if (!TextUtils.isEmpty(xsrfToken)) {
                    builder.header("X-XSRF-TOKEN", xsrfToken);
                }
            }

            return chain.proceed(builder.build());
        };

        client =
            new OkHttpClient.Builder()
                .cookieJar(cookieJar)
                .followRedirects(true)
                .followSslRedirects(true)
                .addInterceptor(requestContextInterceptor)
                .build();

        probeClient =
            new OkHttpClient.Builder()
                .followRedirects(true)
                .followSslRedirects(true)
                .addInterceptor(requestContextInterceptor)
                .build();
    }

    public static synchronized BjmaniaSessionManager getInstance(Context context) {
        if (instance == null) {
            instance = new BjmaniaSessionManager(context.getApplicationContext());
        }

        return instance;
    }

    public synchronized void setUserAgent(@Nullable String nextUserAgent) {
        if (TextUtils.isEmpty(nextUserAgent)) {
            return;
        }

        userAgent = nextUserAgent;
    }

    public synchronized @Nullable String getUserAgent() {
        return userAgent;
    }

    public synchronized void setReferer(@Nullable String nextReferer) {
        String normalizedReferer = normalizeReferer(nextReferer);
        if (TextUtils.isEmpty(normalizedReferer)) {
            return;
        }

        referer = normalizedReferer;
    }

    public synchronized String getReferer() {
        if (!TextUtils.isEmpty(referer)) {
            return referer;
        }

        return DEFAULT_REFERER;
    }

    public synchronized void syncFromWebViewCookieManager() {
        cookieJar.replaceAll(parseWebViewCookies(webViewCookieManager.getCookie(BASE_URL)));
    }

    public synchronized void clearNativeSession() {
        cookieJar.clear();
    }

    public synchronized void clearAllSession() {
        clearNativeSession();

        String cookieHeader = webViewCookieManager.getCookie(BASE_URL);
        if (TextUtils.isEmpty(cookieHeader)) {
            webViewCookieManager.flush();
            return;
        }

        for (String cookiePart : cookieHeader.split(";")) {
            String trimmed = cookiePart.trim();
            int separatorIndex = trimmed.indexOf('=');

            if (separatorIndex <= 0) {
                continue;
            }

            String cookieName = trimmed.substring(0, separatorIndex).trim();
            webViewCookieManager.setCookie(
                BASE_URL,
                cookieName + "=; Expires=Wed, 31 Dec 2000 23:59:59 GMT; Path=/"
            );
        }

        webViewCookieManager.flush();
    }

    public AuthCheckResult probeAuthMeWithWebViewCookies() throws IOException {
        String cookieHeader = webViewCookieManager.getCookie(BASE_URL);
        int cookieLength = cookieHeader == null ? 0 : cookieHeader.length();

        if (TextUtils.isEmpty(cookieHeader)) {
            return new AuthCheckResult(false, 0, cookieLength, false);
        }

        Request request =
            new Request.Builder()
                .url(BASE_URL + "/api/auth/me")
                .header("Accept", "application/json")
                .header("Cookie", cookieHeader)
                .get()
                .build();

        try (Response response = probeClient.newCall(request).execute()) {
            if (response.isSuccessful()) {
                webViewCookieManager.flush();
                syncFromWebViewCookieManager();
            }

            return new AuthCheckResult(response.isSuccessful(), response.code(), cookieLength, true);
        }
    }

    public OkHttpClient getClient() {
        return client;
    }

    private boolean requiresCsrfHeaders(String method) {
        return !"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method);
    }

    private synchronized @Nullable String getXsrfToken() {
        String cookieHeader = webViewCookieManager.getCookie(BASE_URL);
        if (TextUtils.isEmpty(cookieHeader)) {
            return null;
        }

        String rawValue = extractCookieValue(cookieHeader, XSRF_COOKIE_NAME);
        if (TextUtils.isEmpty(rawValue)) {
            return null;
        }

        return Uri.decode(rawValue);
    }

    private @Nullable String extractCookieValue(String cookieHeader, String cookieName) {
        for (String cookiePart : cookieHeader.split(";")) {
            String trimmed = cookiePart.trim();
            int separatorIndex = trimmed.indexOf('=');

            if (separatorIndex <= 0) {
                continue;
            }

            String name = trimmed.substring(0, separatorIndex).trim();
            if (!cookieName.equals(name)) {
                continue;
            }

            return trimmed.substring(separatorIndex + 1).trim();
        }

        return null;
    }

    private @Nullable String normalizeReferer(@Nullable String candidate) {
        if (TextUtils.isEmpty(candidate)) {
            return null;
        }

        HttpUrl url = HttpUrl.parse(candidate.trim());
        if (url == null) {
            return null;
        }

        if (!"https".equals(url.scheme()) || !HOST.equals(url.host())) {
            return null;
        }

        return url.toString();
    }

    private List<Cookie> parseWebViewCookies(@Nullable String cookieHeader) {
        List<Cookie> cookies = new ArrayList<>();

        if (TextUtils.isEmpty(cookieHeader)) {
            return cookies;
        }

        for (String cookiePart : cookieHeader.split(";")) {
            String trimmed = cookiePart.trim();
            int separatorIndex = trimmed.indexOf('=');

            if (separatorIndex <= 0) {
                continue;
            }

            String name = trimmed.substring(0, separatorIndex).trim();
            String value = trimmed.substring(separatorIndex + 1).trim();

            if (name.isEmpty()) {
                continue;
            }

            cookies.add(
                new Cookie.Builder()
                    .name(name)
                    .value(value)
                    .hostOnlyDomain(HOST)
                    .path("/")
                    .secure()
                    .build()
            );
        }

        return cookies;
    }

    public static final class AuthCheckResult {
        public final boolean success;
        public final int statusCode;
        public final int cookieLength;
        public final boolean hadCookie;

        AuthCheckResult(boolean success, int statusCode, int cookieLength, boolean hadCookie) {
            this.success = success;
            this.statusCode = statusCode;
            this.cookieLength = cookieLength;
            this.hadCookie = hadCookie;
        }
    }
}
