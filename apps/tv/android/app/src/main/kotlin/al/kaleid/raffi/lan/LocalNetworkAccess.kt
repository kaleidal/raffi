package al.kaleid.raffi.lan

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONObject

/** Asks for the local network permission Android 17 requires before Raffi can reach Limbo on another computer. */
class LocalNetworkAccess(
    private val activity: ComponentActivity,
    private val reply: (JSONObject) -> Unit,
) {
    private val waiting = mutableListOf<Int>()
    private val launcher = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        waiting.forEach { respond(it, granted) }
        waiting.clear()
    }

    fun request(message: JSONObject) {
        val id = message.getInt("id")
        if (granted()) return respond(id, true)
        waiting += id
        if (waiting.size == 1) launcher.launch(Manifest.permission.ACCESS_LOCAL_NETWORK)
    }

    private fun granted() =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.CINNAMON_BUN ||
            activity.checkSelfPermission(Manifest.permission.ACCESS_LOCAL_NETWORK) == PackageManager.PERMISSION_GRANTED

    private fun respond(id: Int, granted: Boolean) {
        reply(JSONObject().put("type", "response").put("id", id).put("granted", granted))
    }
}
