package com.travelmate.ai;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.animation.AccelerateInterpolator;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.splashscreen.SplashScreen;

public class MainActivity extends Activity {
    private static final int LOCATION_PERMISSION_REQUEST_CODE = 1001;
    private static final int SPLASH_HOLD_MS = 200;
    private static final int SPLASH_ZOOM_MS = 700;
    private static final int SPLASH_FADE_MS = 250;
    private static final int LOAD_TIMEOUT_MS = 8000;
    private static final int COLOR_STARTUP_BACKGROUND = 0xFF1C155F;

    private WebView mWebView;
    private FrameLayout mSplashOverlay;
    private ImageView mSplashIcon;
    private LinearLayout mSplashRetryContainer;
    private TextView mSplashErrorText;
    private ProgressBar mSplashLoadingSpinner;
    private Button mSplashRetryButton;

    private GeolocationPermissions.Callback mGeoCallback;
    private String mGeoOrigin;

    private boolean mIsReadyToDraw = false;
    private boolean mZoomAnimationDone = false;
    private boolean mPageFirstScreenReady = false;
    private boolean mSplashDismissed = false;
    private Handler mTimeoutHandler;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // AndroidX SplashScreen API integration for Android 12+ and backward compatibility
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(new SplashScreen.KeepOnScreenCondition() {
            @Override
            public boolean shouldKeepOnScreen() {
                return !mIsReadyToDraw;
            }
        });

        super.onCreate(savedInstanceState);

        // Eliminate white flashes during startup: configure window background and system bars
        getWindow().setBackgroundDrawable(new ColorDrawable(COLOR_STARTUP_BACKGROUND));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(COLOR_STARTUP_BACKGROUND);
            getWindow().setNavigationBarColor(COLOR_STARTUP_BACKGROUND);
        }

        setContentView(R.layout.activity_main);

        mWebView = findViewById(R.id.webview);
        mSplashOverlay = findViewById(R.id.splash_overlay);
        mSplashIcon = findViewById(R.id.splash_icon);
        mSplashRetryContainer = findViewById(R.id.splash_retry_container);
        mSplashErrorText = findViewById(R.id.splash_error_text);
        mSplashLoadingSpinner = findViewById(R.id.splash_loading_spinner);
        mSplashRetryButton = findViewById(R.id.splash_retry_button);

        // Ensure WebView starts with dark background to avoid white flashes
        mWebView.setBackgroundColor(COLOR_STARTUP_BACKGROUND);

        if (mSplashRetryButton != null) {
            mSplashRetryButton.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    retryLoading();
                }
            });
        }

        // Only play startup zoom animation on a fresh app launch, not on recreation or resume
        boolean isFreshLaunch = (savedInstanceState == null);

        setupWebView();

        if (isFreshLaunch) {
            setupStartupAnimation();
            startLoadingTimeout();
        } else {
            // Restore immediate view state without animation
            mIsReadyToDraw = true;
            mZoomAnimationDone = true;
            mSplashOverlay.setVisibility(View.GONE);
            restoreSystemBars();
        }

        // Load main page in WebView behind the splash
        mWebView.loadUrl("file:///android_asset/index.html");
    }

    private void setupStartupAnimation() {
        // Wait until splash overlay is rendered and ready to draw
        mSplashOverlay.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override
            public boolean onPreDraw() {
                mSplashOverlay.getViewTreeObserver().removeOnPreDrawListener(this);
                mIsReadyToDraw = true;

                // Start animation only once it is visible on screen
                mSplashIcon.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        triggerIconZoomAnimation();
                    }
                }, SPLASH_HOLD_MS);

                return true;
            }
        });
    }

    private void triggerIconZoomAnimation() {
        if (isFinishing() || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 && isDestroyed())) {
            return;
        }

        int screenW = mSplashOverlay.getWidth();
        int screenH = mSplashOverlay.getHeight();
        if (screenW <= 0 || screenH <= 0) {
            DisplayMetrics dm = getResources().getDisplayMetrics();
            screenW = dm.widthPixels;
            screenH = dm.heightPixels;
        }

        float iconSize = mSplashIcon.getWidth() > 0 ? mSplashIcon.getWidth() : (140 * getResources().getDisplayMetrics().density);
        double diagonal = Math.hypot(screenW, screenH);
        // Calculate scale to completely cover corners without stretching
        float targetScale = (float) ((diagonal / iconSize) * 1.25f);

        // Hold for 200ms already elapsed. Over 700ms, smoothly zoom it with ease-in
        mSplashIcon.animate()
            .scaleX(targetScale)
            .scaleY(targetScale)
            .setDuration(SPLASH_ZOOM_MS)
            .setInterpolator(new AccelerateInterpolator(1.8f))
            .withEndAction(new Runnable() {
                @Override
                public void run() {
                    mZoomAnimationDone = true;
                    checkAndFadeIntoMainPage();
                }
            })
            .start();
    }

    private void checkAndFadeIntoMainPage() {
        // Fade only when both the zoom and the page's first screen are ready
        if (mZoomAnimationDone && mPageFirstScreenReady && !mSplashDismissed) {
            mSplashDismissed = true;
            cancelLoadingTimeout();

            // Then fade into the main page over 250ms. Total animation time ~1.2s
            mSplashOverlay.animate()
                .alpha(0.0f)
                .setDuration(SPLASH_FADE_MS)
                .withEndAction(new Runnable() {
                    @Override
                    public void run() {
                        mSplashOverlay.setVisibility(View.GONE);
                        restoreSystemBars();
                    }
                })
                .start();
        }
    }

    private void restoreSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(getResources().getColor(R.color.primary_dark));
            getWindow().setNavigationBarColor(Color.BLACK);
        }
    }

    private void startLoadingTimeout() {
        mTimeoutHandler = new Handler(Looper.getMainLooper());
        mTimeoutHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!mPageFirstScreenReady && !mSplashDismissed) {
                    showLoadingRetryState("Loading is taking longer than usual.");
                }
            }
        }, LOAD_TIMEOUT_MS);
    }

    private void cancelLoadingTimeout() {
        if (mTimeoutHandler != null) {
            mTimeoutHandler.removeCallbacksAndMessages(null);
            mTimeoutHandler = null;
        }
    }

    private void showLoadingRetryState(String message) {
        if (mSplashDismissed) return;
        mSplashIcon.setVisibility(View.GONE);
        mSplashRetryContainer.setVisibility(View.VISIBLE);
        mSplashErrorText.setText(message);
        mSplashLoadingSpinner.setVisibility(View.GONE);
        mSplashRetryButton.setVisibility(View.VISIBLE);
    }

    private void retryLoading() {
        mSplashRetryContainer.setVisibility(View.GONE);
        mSplashIcon.setVisibility(View.VISIBLE);
        mSplashIcon.setScaleX(1.0f);
        mSplashIcon.setScaleY(1.0f);
        mSplashLoadingSpinner.setVisibility(View.VISIBLE);
        mZoomAnimationDone = false;
        mPageFirstScreenReady = false;
        startLoadingTimeout();
        mWebView.reload();
        triggerIconZoomAnimation();
    }

    private void setupWebView() {
        WebSettings settings = mWebView.getSettings();
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setGeolocationEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        mWebView.addJavascriptInterface(new WebAppInterface(this), "TravelMateNative");

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/") || url.startsWith("http://localhost") || url.startsWith("http://10.0.2.2")) {
                    return false;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Give a short delay to ensure first layout/paint is complete
                mWebView.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        mPageFirstScreenReady = true;
                        checkAndFadeIntoMainPage();
                    }
                }, 50);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                showLoadingRetryState("Unable to load TravelMate AI: " + description);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    showLoadingRetryState("Unable to connect to TravelMate AI.");
                }
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                mGeoOrigin = origin;
                mGeoCallback = callback;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(
                            new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                            LOCATION_PERMISSION_REQUEST_CODE
                        );
                        return;
                    }
                }
                callback.invoke(origin, true, false);
            }
        });
    }

    public void requestLocationPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(
                    new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                    LOCATION_PERMISSION_REQUEST_CODE
                );
            } else {
                Toast.makeText(this, "Location permission already granted", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST_CODE) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (mGeoCallback != null && mGeoOrigin != null) {
                mGeoCallback.invoke(mGeoOrigin, granted, false);
            }
            if (granted) {
                Toast.makeText(this, "Location permission granted for Smart Navigation", Toast.LENGTH_SHORT).show();
                mWebView.reload();
            } else {
                Toast.makeText(this, "Location permission denied. You can still enter your city manually.", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mWebView != null) {
            mWebView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mWebView != null) {
            mWebView.onPause();
        }
    }

    @Override
    protected void onDestroy() {
        cancelLoadingTimeout();
        super.onDestroy();
    }
}
