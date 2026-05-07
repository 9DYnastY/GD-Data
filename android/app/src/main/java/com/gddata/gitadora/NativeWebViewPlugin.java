package com.gddata.gitadora;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeWebView")
public class NativeWebViewPlugin extends Plugin {

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = trimToNull(call.getString("url"));
        String title = trimToNull(call.getString("title"));

        if (!isHttpUrl(url)) {
            call.reject("NativeWebView.openUrl requires an http or https URL.");
            return;
        }

        Intent intent = new Intent(getActivity(), RemyWebViewActivity.class);
        intent.putExtra(RemyWebViewActivity.EXTRA_URL, url);

        if (title != null) {
            intent.putExtra(RemyWebViewActivity.EXTRA_TITLE, title);
        }

        getActivity().startActivity(intent);
        call.resolve();
    }

    private static boolean isHttpUrl(String url) {
        if (url == null) {
            return false;
        }

        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();

        return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
