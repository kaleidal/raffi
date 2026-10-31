package al.kaleid.raffi.web

import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

private const val TIMEOUT_MS = 10_000

/** GET requests for endpoints whose CORS rules shut the page out. */
class HostHttp(private val reply: (JSONObject) -> Unit) {
    private val executor = Executors.newCachedThreadPool()
    private val main = Handler(Looper.getMainLooper())

    fun get(message: JSONObject) {
        val id = message.getInt("id")
        val url = message.getString("url")
        val headers = message.optJSONObject("headers") ?: JSONObject()
        executor.execute {
            val result = runCatching { request(url, headers) }
                .getOrElse { JSONObject().put("error", it.message ?: "Request failed") }
            main.post { reply(result.put("type", "response").put("id", id)) }
        }
    }

    private fun request(url: String, headers: JSONObject): JSONObject {
        require(url.startsWith("https://") || url.startsWith("http://")) { "Only web addresses can be fetched" }
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = TIMEOUT_MS
        connection.readTimeout = TIMEOUT_MS
        headers.keys().forEach { connection.setRequestProperty(it, headers.getString(it)) }
        try {
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            return JSONObject()
                .put("status", status)
                .put("contentType", connection.contentType ?: "")
                .put("body", stream?.bufferedReader()?.use { it.readText() } ?: "")
        } finally {
            connection.disconnect()
        }
    }
}
