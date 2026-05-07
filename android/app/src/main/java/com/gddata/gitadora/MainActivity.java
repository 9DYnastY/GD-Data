package com.gddata.gitadora;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BjmaniaAuthPlugin.class);
        registerPlugin(BjmaniaApiPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(ImageSaverPlugin.class);
        registerPlugin(NativeWebViewPlugin.class);
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(100);
        }
    }
}
