package com.gddata.gitadora;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import okhttp3.MediaType;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "BjmaniaApi")
public class BjmaniaApiPlugin extends Plugin {

    private static final MediaType GRPC_WEB_MEDIA_TYPE = MediaType.parse("application/grpc-web+proto");
    private static final Set<String> ALLOWED_BINARY_HOSTS = new HashSet<>(
        Arrays.asList(BjmaniaSessionManager.HOST, "assets.bjmania.com")
    );

    @PluginMethod
    public void authMe(PluginCall call) {
        execute(
            () -> {
                BjmaniaSessionManager sessionManager = BjmaniaSessionManager.getInstance(getContext());
                sessionManager.syncFromWebViewCookieManager();

                Request request =
                    new Request.Builder()
                        .url(BjmaniaSessionManager.BASE_URL + "/api/auth/me")
                        .header("Accept", "application/json")
                        .get()
                        .build();

                try (Response response = sessionManager.getClient().newCall(request).execute()) {
                    call.resolve(buildJsonResponse(response));
                } catch (IOException | JSONException exception) {
                    call.reject("BJMANIA authMe failed: " + exception.getMessage(), exception);
                }
            }
        );
    }

    @PluginMethod
    public void grpcUnary(PluginCall call) {
        String path = call.getString("path");
        String requestBase64 = call.getString("requestBase64");

        if (path == null || path.trim().isEmpty()) {
            call.reject("BJMANIA grpcUnary requires a path.");
            return;
        }

        if (requestBase64 == null) {
            call.reject("BJMANIA grpcUnary requires requestBase64.");
            return;
        }

        execute(
            () -> {
                BjmaniaSessionManager sessionManager = BjmaniaSessionManager.getInstance(getContext());
                sessionManager.syncFromWebViewCookieManager();
                byte[] requestBytes = Base64.decode(requestBase64, Base64.DEFAULT);

                Request request =
                    new Request.Builder()
                        .url(BjmaniaSessionManager.BASE_URL + path)
                        .header("Accept", "*/*")
                        .header("Content-Type", "application/grpc-web+proto")
                        .header("X-Grpc-Web", "1")
                        .header("X-User-Agent", "grpc-web-javascript/0.1")
                        .post(RequestBody.create(requestBytes, GRPC_WEB_MEDIA_TYPE))
                        .build();

                try (Response response = sessionManager.getClient().newCall(request).execute()) {
                    JSObject result = new JSObject();
                    result.put("status", response.code());
                    result.put(
                        "responseBase64",
                        response.body() == null
                            ? ""
                            : Base64.encodeToString(response.body().bytes(), Base64.NO_WRAP)
                    );
                    call.resolve(result);
                } catch (IOException exception) {
                    call.reject("BJMANIA grpcUnary failed: " + exception.getMessage(), exception);
                }
            }
        );
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        BjmaniaSessionManager.getInstance(getContext()).clearAllSession();
        call.resolve();
    }

    @PluginMethod
    public void fetchBinary(PluginCall call) {
        String url = call.getString("url");
        String accept = call.getString("accept", "*/*");

        if (url == null || url.trim().isEmpty()) {
            call.reject("BJMANIA fetchBinary requires a url.");
            return;
        }

        okhttp3.HttpUrl httpUrl = okhttp3.HttpUrl.parse(url.trim());
        if (httpUrl == null || !"https".equals(httpUrl.scheme()) || !ALLOWED_BINARY_HOSTS.contains(httpUrl.host())) {
            call.reject("BJMANIA fetchBinary only allows HTTPS requests to BJMANIA hosts.");
            return;
        }

        execute(
            () -> {
                BjmaniaSessionManager sessionManager = BjmaniaSessionManager.getInstance(getContext());
                sessionManager.syncFromWebViewCookieManager();

                Request request =
                    new Request.Builder()
                        .url(httpUrl)
                        .header("Accept", accept)
                        .get()
                        .build();

                try (Response response = sessionManager.getClient().newCall(request).execute()) {
                    call.resolve(buildBinaryResponse(response));
                } catch (IOException exception) {
                    call.reject("BJMANIA fetchBinary failed: " + exception.getMessage(), exception);
                }
            }
        );
    }

    private JSObject buildJsonResponse(Response response) throws IOException, JSONException {
        JSObject result = new JSObject();
        result.put("status", response.code());

        if (response.body() == null) {
            result.put("data", JSONObject.NULL);
            return result;
        }

        String body = response.body().string();
        if (body.isEmpty()) {
            result.put("data", JSONObject.NULL);
            return result;
        }

        Object data = new JSONObject("{\"value\":" + body + "}").get("value");
        result.put("data", data);
        return result;
    }

    private JSObject buildBinaryResponse(Response response) throws IOException {
        JSObject result = new JSObject();
        result.put("status", response.code());
        result.put(
            "responseBase64",
            response.body() == null
                ? ""
                : Base64.encodeToString(response.body().bytes(), Base64.NO_WRAP)
        );
        return result;
    }
}
