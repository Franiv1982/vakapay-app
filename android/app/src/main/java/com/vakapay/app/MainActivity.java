package com.vakapay.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propios de la app (antes de super.onCreate)
        registerPlugin(TemaNativoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
