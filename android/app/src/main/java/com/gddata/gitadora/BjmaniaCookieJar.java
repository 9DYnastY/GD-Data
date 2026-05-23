package com.gddata.gitadora;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.HttpUrl;

public final class BjmaniaCookieJar implements CookieJar {

    private final Map<String, Cookie> cookies = new LinkedHashMap<>();

    @Override
    public synchronized void saveFromResponse(HttpUrl url, List<Cookie> cookies) {
        long now = System.currentTimeMillis();

        for (Cookie cookie : cookies) {
            if (cookie.expiresAt() < now) {
                this.cookies.remove(cookieKey(cookie));
                continue;
            }

            this.cookies.put(cookieKey(cookie), cookie);
        }
    }

    @Override
    public synchronized List<Cookie> loadForRequest(HttpUrl url) {
        long now = System.currentTimeMillis();
        List<Cookie> matched = new ArrayList<>();
        Iterator<Map.Entry<String, Cookie>> iterator = cookies.entrySet().iterator();

        while (iterator.hasNext()) {
            Cookie cookie = iterator.next().getValue();

            if (cookie.expiresAt() < now) {
                iterator.remove();
                continue;
            }

            if (cookie.matches(url)) {
                matched.add(cookie);
            }
        }

        return matched;
    }

    public synchronized void replaceAll(List<Cookie> nextCookies) {
        cookies.clear();
        long now = System.currentTimeMillis();

        for (Cookie cookie : nextCookies) {
            if (cookie.expiresAt() < now) {
                continue;
            }

            cookies.put(cookieKey(cookie), cookie);
        }
    }

    public synchronized void clear() {
        cookies.clear();
    }

    private String cookieKey(Cookie cookie) {
        return cookie.name() + "@" + cookie.domain() + cookie.path();
    }
}
