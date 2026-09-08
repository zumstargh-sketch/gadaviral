package com.gadaviral.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.LinearLayout
import androidx.appcompat.app.AppCompatActivity

/**
 * Hosts the GADAVIRAL app experience — the SAME web app and SAME backend as
 * the website and the Windows desktop app. The native app performs login/
 * registration/Google sign-in natively, then hands its session to the app
 * view (localStorage injection), so every feature is fully functional.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var loader: ProgressBar

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        loader = ProgressBar(this).apply {
            layoutParams = LinearLayout.LayoutParams(-1, 12)
            indeterminateTintList = android.content.res.ColorStateList.valueOf(0xFFF2A900.toInt())
        }
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) { injectSession() }
            }
        }
        root.addView(loader)
        root.addView(webView, LinearLayout.LayoutParams(-1, -1))
        setContentView(root)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.loadUrl(BuildConfig.API_BASE_URL)
    }

    /** Write the native session into the web app's token store, then reload. */
    private fun injectSession() {
        val js = """
            (function(){
              try {
                var a = ${json(Session.accessToken)};
                var r = ${json(Session.refreshToken)};
                if (a) { localStorage.setItem('gadv_access', a); localStorage.setItem('gadv_refresh', r || ''); }
              } catch (e) {}
            })();
        """.trimIndent()
        webView.evaluateJavascript(js) {
            // Reload once so the SPA boots with the session (avoid loops with a flag)
            if (!webView.getTag(R.id.tag_injected).isSuccess()) {
                webView.setTag(R.id.tag_injected, true)
                webView.reload()
            } else {
                loader.visibility = View.GONE
            }
        }
    }

    private fun json(v: String?): String = v?.let { "\"${it.replace("\"", "\\\"")}\"" } ?: "null"

    private fun Any?.isSuccess(): Boolean = this == true

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
