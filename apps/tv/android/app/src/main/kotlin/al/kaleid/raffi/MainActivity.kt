package al.kaleid.raffi

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.media3.ui.PlayerView
import al.kaleid.raffi.input.VoiceInput
import al.kaleid.raffi.lan.LimboDiscovery
import al.kaleid.raffi.lan.LocalNetworkAccess
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
    private lateinit var localNetwork: LocalNetworkAccess
    private lateinit var limboDiscovery: LimboDiscovery
    private lateinit var voice: VoiceInput

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
        localNetwork = LocalNetworkAccess(this, bridge::send)
        limboDiscovery = LimboDiscovery(this, bridge::send)
        voice = VoiceInput(this, bridge::send)

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
            type == "http.request" -> http.handle(message)
            type == "lan.permit" -> localNetwork.request(message)
            type == "limbo.discover" -> limboDiscovery.discover(message)
            type == "voice.listen" -> voice.listen(message)
            type == "youtube.open" -> bridge.send(
                JSONObject().put("type", "response").put("id", message.getInt("id"))
                    .put("opened", openYouTube(message.getString("videoId"))),
            )
            type == "device.info" -> bridge.send(
                JSONObject().put("type", "response").put("id", message.getInt("id")).put("name", deviceName()),
            )
            type.startsWith("player.") -> player.handle(type, message)
        }
    }

    /**
     * The YouTube app plays trailers far better than an embedded player can on TV hardware.
     * Android TV answers any web link with a placeholder, so this looks for YouTube itself.
     * finish_on_ended opens YouTube's standalone player, which hands Back to Raffi instead of YouTube's home.
     */
    @Suppress("DEPRECATION")
    private fun openYouTube(videoId: String): Boolean {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=${Uri.encode(videoId)}"))
            .putExtra("finish_on_ended", true)
        val youtube = packageManager.queryIntentActivities(intent, 0)
            .firstOrNull { it.activityInfo.packageName.startsWith(YOUTUBE_PACKAGE) } ?: return false
        startActivity(intent.setPackage(youtube.activityInfo.packageName))
        return true
    }

    private fun deviceName() =
        Settings.Global.getString(contentResolver, Settings.Global.DEVICE_NAME) ?: Build.MODEL

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

private const val YOUTUBE_PACKAGE = "com.google.android.youtube"
