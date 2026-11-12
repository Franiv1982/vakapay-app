package com.vakapay.app;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hace que las ventanas que abre Android (listas desplegables de un <select>,
 * calendario de las fechas) sigan el tema elegido en la app y no el del móvil.
 * Desde la página: Capacitor.Plugins.TemaNativo.fijar({ modo: 'oscuro' | 'claro' | 'auto' }).
 * La actividad declara uiMode en configChanges, así que el cambio no la reinicia.
 */
@CapacitorPlugin(name = "TemaNativo")
public class TemaNativoPlugin extends Plugin {

    @PluginMethod
    public void fijar(PluginCall call) {
        String modo = call.getString("modo", "auto");
        final int nocturno;
        if ("oscuro".equals(modo)) nocturno = AppCompatDelegate.MODE_NIGHT_YES;
        else if ("claro".equals(modo)) nocturno = AppCompatDelegate.MODE_NIGHT_NO;
        else nocturno = AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;

        getActivity().runOnUiThread(() -> {
            try {
                AppCompatActivity actividad = (AppCompatActivity) getActivity();
                if (actividad.getDelegate().getLocalNightMode() != nocturno) {
                    actividad.getDelegate().setLocalNightMode(nocturno);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo cambiar el tema de Android", e);
            }
        });
    }
}
