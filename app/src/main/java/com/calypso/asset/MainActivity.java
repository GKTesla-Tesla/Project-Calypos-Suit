package com.calypso.asset;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.OutputStream;

/**
 * Hosts the Calypso Asset page (bundled in assets/www) in a full-screen WebView.
 * Records live in the WebView's localStorage; the page talks to the phone through
 * the "CalypsoAndroid" bridge only to save exported files.
 */
public class MainActivity extends Activity {
    private static final String START_URL = "https://appassets.androidplatform.net/www/index.html";
    private static final int REQ_PICK_FILE = 1;
    private static final int REQ_SAVE_FILE = 2;

    private WebView web;
    private ValueCallback<Uri[]> pendingPick;
    private byte[] pendingSave;
    private String pendingSaveId;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        if (!night) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }

        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.bg));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);

        // Serves assets/www/* at https://appassets.androidplatform.net/www/* so localStorage has a stable origin.
        final WebViewAssetLoader wwwLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return wwwLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingPick != null) pendingPick.onReceiveValue(null);
                pendingPick = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "application/vnd.ms-excel", "text/csv", "text/comma-separated-values",
                        "application/octet-stream"});
                try {
                    startActivityForResult(i, REQ_PICK_FILE);
                } catch (Exception e) {
                    pendingPick = null;
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "CalypsoAndroid");
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    /** Called from the page's downloads shim; opens the system "Save as" screen. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(final String id, final String filename, final String base64, final String mime) {
            runOnUiThread(() -> {
                pendingSave = Base64.decode(base64, Base64.DEFAULT);
                pendingSaveId = id;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, filename);
                try {
                    startActivityForResult(i, REQ_SAVE_FILE);
                } catch (Exception e) {
                    finishSave("unavailable");
                }
            });
        }
    }

    private void finishSave(String status) {
        String id = pendingSaveId;
        pendingSave = null;
        pendingSaveId = null;
        if (id == null) return;
        web.evaluateJavascript("window.__calypsoSaved && window.__calypsoSaved(" + JSONObject.quote(id) + "," + JSONObject.quote(status) + ")", null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_FILE) {
            if (pendingPick != null) {
                Uri u = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
                pendingPick.onReceiveValue(u == null ? null : new Uri[]{u});
                pendingPick = null;
            }
        } else if (requestCode == REQ_SAVE_FILE) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null || pendingSave == null) {
                finishSave("declined");
                return;
            }
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                out.write(pendingSave);
                finishSave("saved");
            } catch (Exception e) {
                finishSave("unavailable");
            }
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.calypsoBack ? window.calypsoBack() : false", result -> {
            if (!"true".equals(result)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }
}
