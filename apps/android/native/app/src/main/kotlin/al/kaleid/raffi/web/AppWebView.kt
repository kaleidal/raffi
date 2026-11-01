package al.kaleid.raffi.web

import android.graphics.Color
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import al.kaleid.raffi.BuildConfig

/** Serves the bundled Raffi web app from a real https origin so the sync service and addons treat it like the web app. */
object AppWebView {
    private const val HOST = "tv.raffi.al"
    const val ORIGIN = "https://$HOST"
    /** The page lays itself out for a remote or for touch depending on `device`. */
    fun startUrl(isTv: Boolean) = "$ORIGIN/index.html?device=${if (isTv) "tv" else "phone"}"

    /** [onRendererGone] runs when the system kills the page's renderer, usually to free memory. */
    fun configure(webView: WebView, onRendererGone: () -> Unit) {
        val assets = WebViewAssetLoader.AssetsPathHandler(webView.context)
        val loader = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/") { path -> assets.handle("web/$path") }
            .build()

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.setBackgroundColor(Color.TRANSPARENT)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) =
                request.url.host != HOST

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                onRendererGone()
                return true
            }
        }
        webView.requestFocus()
    }
}
