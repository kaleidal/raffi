package al.kaleid.raffi.player

import android.app.Activity
import android.net.Uri
import android.os.Handler
import android.os.LocaleList
import android.os.Looper
import android.view.View
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.DefaultTrackNameProvider
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import org.json.JSONObject

private const val STATE_INTERVAL_MS = 500L
private const val USER_AGENT = "Raffi TV"

/** Plays streams under the transparent WebView and reports playback to the page. */
@OptIn(UnstableApi::class)
class NativePlayer(
    private val activity: Activity,
    private val view: PlayerView,
    private val emit: (JSONObject) -> Unit,
) {
    private var player: ExoPlayer? = null
    private var source: MediaItem? = null
    private var addonSubtitlePending = false
    private val trackNames = DefaultTrackNameProvider(activity.resources)
    private val ticker = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            emitState()
            ticker.postDelayed(this, STATE_INTERVAL_MS)
        }
    }

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = emitState()

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            view.keepScreenOn = isPlaying
            ticker.removeCallbacks(tick)
            if (isPlaying) ticker.post(tick)
        }

        override fun onTracksChanged(tracks: Tracks) {
            val exo = player ?: return
            if (addonSubtitlePending && TrackList.selectAddonSubtitle(exo, tracks)) {
                addonSubtitlePending = false
            }
            emit(TrackList.describe(tracks, trackNames))
        }

        override fun onPlayerError(error: PlaybackException) {
            emit(
                JSONObject()
                    .put("type", "player.error")
                    .put("message", error.errorCodeName)
                    .put("details", error.message ?: ""),
            )
        }
    }

    fun handle(type: String, message: JSONObject) {
        when (type) {
            "player.load" -> load(message)
            "player.play" -> player?.play()
            "player.pause" -> pause()
            "player.seek" -> player?.seekTo(message.getLong("ms"))
            "player.audio" -> player?.let { TrackList.select(it, C.TRACK_TYPE_AUDIO, message.getString("id")) }
            "player.subtitle" -> selectSubtitle(message)
            "player.captionInset" -> view.subtitleView?.setBottomPaddingFraction(
                SubtitleView.DEFAULT_BOTTOM_PADDING_FRACTION + message.getDouble("fraction").toFloat(),
            )
            "player.fit" -> view.resizeMode = when (message.getString("mode")) {
                "cover" -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
            }
            "player.stop" -> release()
        }
    }

    fun pause() {
        player?.pause()
    }

    fun release() {
        ticker.removeCallbacks(tick)
        player?.release()
        player = null
        source = null
        addonSubtitlePending = false
        view.player = null
        view.visibility = View.GONE
        view.keepScreenOn = false
    }

    private fun load(message: JSONObject) {
        val item = MediaItem.Builder()
            .setUri(message.getString("url"))
            .setMediaMetadata(MediaMetadata.Builder().setTitle(message.optString("title")).build())
            .build()
        val exo = player ?: createPlayer().also { player = it }
        source = item
        addonSubtitlePending = false
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon().clearOverrides().build()
        exo.setMediaItem(item, message.optLong("startMs"))
        exo.prepare()
        exo.play()
        view.visibility = View.VISIBLE
    }

    private fun createPlayer(): ExoPlayer {
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent(USER_AGENT)
        val movieAudio = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()
        val renderers = DefaultRenderersFactory(activity)
            .setEnableDecoderFallback(true)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
        return ExoPlayer.Builder(activity)
            .setRenderersFactory(renderers)
            .setLoadControl(heapBoundLoadControl())
            .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(activity, http)))
            .setAudioAttributes(movieAudio, true)
            .build()
            .also {
                it.trackSelectionParameters = it.trackSelectionParameters.buildUpon()
                    .setPreferredAudioLanguages(*preferredLanguages())
                    .build()
                it.addListener(listener)
                view.player = it
            }
    }

    /** The stock buffer is sized for phones and outgrows a TV's heap on high-bitrate releases. */
    private fun heapBoundLoadControl() = DefaultLoadControl.Builder()
        .setTargetBufferBytes((Runtime.getRuntime().maxMemory() / 2).toInt())
        .build()

    private fun selectSubtitle(message: JSONObject) {
        val exo = player ?: return
        when (message.getString("kind")) {
            "off" -> TrackList.disable(exo, C.TRACK_TYPE_TEXT)
            "embedded" -> TrackList.select(exo, C.TRACK_TYPE_TEXT, message.getString("id"))
            "addon" -> attachAddonSubtitle(exo, message)
        }
    }

    private fun attachAddonSubtitle(exo: ExoPlayer, message: JSONObject) {
        val current = source ?: return
        val url = message.getString("url")
        val subtitle = MediaItem.SubtitleConfiguration.Builder(Uri.parse(url))
            .setId(TrackList.ADDON_SUBTITLE_ID)
            .setMimeType(subtitleMimeType(url))
            .setLanguage(message.optString("lang"))
            .setLabel(message.optString("label"))
            .build()
        val item = current.buildUpon().setSubtitleConfigurations(listOf(subtitle)).build()
        source = item
        addonSubtitlePending = true
        exo.setMediaItem(item, false)
        exo.prepare()
    }

    /** The TV's own languages first, then English, rather than whichever track a release lists first. */
    private fun preferredLanguages(): Array<String> {
        val locales = LocaleList.getDefault()
        return ((0 until locales.size()).map { locales[it].language } + "en").distinct().toTypedArray()
    }

    private fun subtitleMimeType(url: String) = when {
        url.contains(".vtt", ignoreCase = true) -> MimeTypes.TEXT_VTT
        url.contains(".ass", ignoreCase = true) || url.contains(".ssa", ignoreCase = true) -> MimeTypes.TEXT_SSA
        else -> MimeTypes.APPLICATION_SUBRIP
    }

    private fun emitState() {
        val exo = player ?: return
        emit(
            JSONObject()
                .put("type", "player.state")
                .put("playing", exo.isPlaying)
                .put("playWhenReady", exo.playWhenReady)
                .put("buffering", exo.playbackState == Player.STATE_BUFFERING)
                .put("ended", exo.playbackState == Player.STATE_ENDED)
                .put("position", exo.currentPosition / 1000.0)
                .put("duration", if (exo.duration == C.TIME_UNSET) 0.0 else exo.duration / 1000.0)
                .put("buffered", exo.bufferedPosition / 1000.0),
        )
    }
}
