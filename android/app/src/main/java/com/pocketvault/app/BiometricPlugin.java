package com.pocketvault.app;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {

    @PluginMethod
    public void authenticate(PluginCall call) {
        int authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            authenticators |= BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        }
        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock PocketVault")
            .setSubtitle("Use your device biometric or screen lock")
            .setAllowedAuthenticators(authenticators)
            .build();

        getActivity().runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(
                getActivity(),
                ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        JSObject ret = new JSObject();
                        ret.put("authenticated", true);
                        call.resolve(ret);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        call.reject(errString.toString(), String.valueOf(errorCode));
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // The prompt stays open; the error callback handles cancellation.
                    }
                }
            );
            prompt.authenticate(promptInfo);
        });
    }
}
