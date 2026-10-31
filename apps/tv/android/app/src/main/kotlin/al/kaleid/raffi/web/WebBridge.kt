package al.kaleid.raffi.web

import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import org.json.JSONObject

/** JSON message channel exposed to the page as `window.raffiTv`. */
class WebBridge(
    private val webView: WebView,
    private val onMessage: (JSONObject) -> Unit,
) {
    private var reply: JavaScriptReplyProxy? = null

    fun install() {
        WebViewCompat.addWebMessageListener(webView, "raffiTv", setOf(AppWebView.ORIGIN)) { _, message, _, isMainFrame, replyProxy ->
            if (!isMainFrame) return@addWebMessageListener
            reply = replyProxy
            message.data?.let { onMessage(JSONObject(it)) }
        }
    }

    fun send(message: JSONObject) {
        reply?.postMessage(message.toString())
    }
}
