package al.kaleid.raffi

import android.os.Bundle
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.media3.ui.PlayerView
import al.kaleid.raffi.player.NativePlayer
import al.kaleid.raffi.web.AppWebView
import al.kaleid.raffi.web.HostHttp
import al.kaleid.raffi.web.WebBridge
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var bridge: WebBridge
    private lateinit var player: NativePlayer
    private lateinit var http: HostHttp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val playerView = PlayerView(this).apply {
            useController = false
            visibility = View.GONE
        }
        webView = WebView(this)
        setContentView(FrameLayout(this).apply {
            addView(playerView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            addView(webView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        })

        bridge = WebBridge(webView, ::onWebMessage)
        player = NativePlayer(this, playerView, bridge::send)
        http = HostHttp(bridge::send)

        AppWebView.configure(webView, onRendererGone = ::recreate)
        bridge.install()
        webView.loadUrl(AppWebView.START_URL)

        onBackPressedDispatcher.addCallback(this) {
            bridge.send(JSONObject().put("type", "key.back"))
        }
    }

    private fun onWebMessage(message: JSONObject) {
        val type = message.getString("type")
        when {
            type == "app.exit" -> finish()
            type == "http.get" -> http.get(message)
            type.startsWith("player.") -> player.handle(type, message)
        }
    }

    override fun onStop() {
        super.onStop()
        player.pause()
    }

    override fun onDestroy() {
        player.release()
        webView.destroy()
        super.onDestroy()
    }
}
