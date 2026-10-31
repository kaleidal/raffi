package al.kaleid.raffi.input

import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONObject

/** Opens the system voice prompt and answers the page with what was said. */
class VoiceInput(activity: ComponentActivity, private val reply: (JSONObject) -> Unit) {
    private var pendingId: Int? = null

    private val launcher = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val text = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        answer(text)
    }

    fun listen(message: JSONObject) {
        answer(null)
        pendingId = message.getInt("id")
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH)
        runCatching { launcher.launch(intent) }.onFailure { answer(null) }
    }

    private fun answer(text: String?) {
        val id = pendingId ?: return
        pendingId = null
        reply(JSONObject().put("type", "response").put("id", id).put("text", text ?: JSONObject.NULL))
    }
}
