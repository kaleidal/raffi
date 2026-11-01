package al.kaleid.raffi.screen

import android.app.Activity
import android.app.UiModeManager
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.view.View
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Phones keep the page clear of the status and navigation bars while browsing, then give the
 * whole screen, turned sideways, to video. TVs have no system bars and never rotate.
 */
class DeviceScreen(private val activity: Activity, private val root: View) {
    val isTv = activity.getSystemService(UiModeManager::class.java).currentModeType ==
        Configuration.UI_MODE_TYPE_TELEVISION

    private var fullscreen = false
    private val bars = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()

    init {
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val padding = if (fullscreen) Insets.NONE else insets.getInsets(bars)
            view.setPadding(padding.left, padding.top, padding.right, padding.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    fun setFullscreen(on: Boolean) {
        if (isTv || fullscreen == on) return
        fullscreen = on
        val controller = WindowCompat.getInsetsController(activity.window, root)
        if (on) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        ViewCompat.requestApplyInsets(root)
    }
}
