package com.travelmate.ai;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

public class WebAppInterface {
    private final MainActivity mActivity;

    public WebAppInterface(MainActivity activity) {
        this.mActivity = activity;
    }

    @JavascriptInterface
    public boolean isAndroidApp() {
        return true;
    }

    @JavascriptInterface
    public String getAppVersion() {
        return "1.0.3";
    }

    @JavascriptInterface
    public void openGoogleMapsNavigation(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.setPackage("com.google.android.apps.maps");
            if (intent.resolveActivity(mActivity.getPackageManager()) != null) {
                mActivity.startActivity(intent);
            } else {
                // Fallback to web browser or any map handler
                Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                mActivity.startActivity(fallback);
            }
        } catch (Exception e) {
            Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            mActivity.startActivity(fallback);
        }
    }

    @JavascriptInterface
    public void showToast(String message) {
        Toast.makeText(mActivity, message, Toast.LENGTH_SHORT).show();
    }

    @JavascriptInterface
    public void requestDeviceLocation() {
        mActivity.requestLocationPermissions();
    }
}
