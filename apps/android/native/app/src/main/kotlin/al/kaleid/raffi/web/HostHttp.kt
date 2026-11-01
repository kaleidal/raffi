package al.kaleid.raffi.web

import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

private const val TIMEOUT_MS = 10_000

/** Requests for endpoints the page can't reach itself: services whose CORS rules shut it out, and Limbo on the local network. */
class HostHttp(private val reply: (JSONObject) -> Unit) {
    private val executor = Executors.newCachedThreadPool()
    private val main = Handler(Looper.getMainLooper())

    fun handle(message: JSONObject) {
        val id = message.getInt("id")
        val url = message.getString("url")
        val method = message.optString("method", "GET")
        val headers = message.optJSONObject("headers") ?: JSONObject()
        val body = message.optString("body").takeIf { message.has("body") }
        val timeoutMs = message.optInt("timeoutMs", TIMEOUT_MS)
        executor.execute {
            val result = runCatching { request(url, method, headers, body, timeoutMs) }
                .getOrElse { JSONObject().put("error", it.message ?: "Request failed") }
            main.post { reply(result.put("type", "response").put("id", id)) }
        }
    }

    private fun request(url: String, method: String, headers: JSONObject, body: String?, timeoutMs: Int): JSONObject {
        require(url.startsWith("https://") || url.startsWith("http://")) { "Only web addresses can be fetched" }
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = minOf(timeoutMs, TIMEOUT_MS)
        connection.readTimeout = timeoutMs
        connection.requestMethod = method
        headers.keys().forEach { connection.setRequestProperty(it, headers.getString(it)) }
        try {
            if (body != null) {
                connection.doOutput = true
                connection.outputStream.use { it.write(body.toByteArray()) }
            }
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
