package com.gddata.gitadora;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BjmaniaAuth")
public class BjmaniaAuthPlugin extends Plugin {

    @PluginMethod
    public void openLogin(PluginCall call) {
        Intent intent = new Intent(getActivity(), BjmaniaLoginActivity.class);
        startActivityForResult(call, intent, "handleLoginResult");
    }

    @ActivityCallback
    private void handleLoginResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        JSObject response = new JSObject();
        Intent data = result.getData();
        boolean success =
            result.getResultCode() == Activity.RESULT_OK &&
            data != null &&
            data.getBooleanExtra(BjmaniaLoginActivity.EXTRA_SUCCESS, false);
        boolean cancelled =
            data != null && data.getBooleanExtra(BjmaniaLoginActivity.EXTRA_CANCELLED, false);

        response.put("success", success);
        response.put("cancelled", cancelled);

        call.resolve(response);
    }
}
