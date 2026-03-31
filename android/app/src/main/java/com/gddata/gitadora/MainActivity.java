package com.gddata.gitadora;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BjmaniaAuthPlugin.class);
        registerPlugin(BjmaniaApiPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
