package al.kaleid.raffi.web

import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import javax.net.ssl.SSLException

private const val CONNECT_TIMEOUT_MS = 15_000
private const val READ_TIMEOUT_MS = 30_000
private const val MAX_REDIRECTS = 5
private const val UNREACHABLE = 523
private const val BAD_CERTIFICATE = 526

/**
 * Streams IPTV playlists and guides to the page from the app's own origin, since their servers
 * rarely allow cross-origin requests. The page reads the body as it arrives, so large guides never sit in memory whole.
 * Failures to connect answer 523 and certificate problems 526, matching the desktop proxy.
 */
object LiveProxy {
    private const val PATH = "/_live"

    fun handles(url: Uri, host: String) = url.host == host && url.path == PATH

    fun respond(url: Uri): WebResourceResponse {
        val target = url.getQueryParameter("url")
            ?: return failure(400, "Missing address")
        return runCatching { forward(target, url.getQueryParameter("ua"), url.getQueryParameter("referer")) }
            .getOrElse {
                failure(if (it is SSLException) BAD_CERTIFICATE else UNREACHABLE, it.message ?: "Couldn't reach the server")
            }
    }

    /** Follows redirects by hand, because HttpURLConnection won't cross between http and https. */
    private fun forward(target: String, userAgent: String?, referer: String?): WebResourceResponse {
        var address = target
        repeat(MAX_REDIRECTS + 1) {
            require(address.startsWith("http://") || address.startsWith("https://")) { "Only web addresses can be fetched" }
            val connection = (URL(address).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                userAgent?.let { setRequestProperty("User-Agent", it) }
                referer?.let { setRequestProperty("Referer", it) }
            }
            val status = connection.responseCode
            val location = connection.getHeaderField("Location")
            if (status in 300..399 && location != null) {
                connection.disconnect()
                address = URL(URL(address), location).toString()
                return@repeat
            }
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            return WebResourceResponse(
                connection.contentType?.substringBefore(";")?.trim() ?: "application/octet-stream",
                null,
                status,
                connection.responseMessage?.takeIf { it.isNotBlank() } ?: "OK",
                emptyMap(),
                stream ?: ByteArrayInputStream(ByteArray(0)),
            )
        }
        throw IllegalStateException("Too many redirects")
    }

    private fun failure(status: Int, message: String) =
        WebResourceResponse("text/plain", "utf-8", status, "Error", emptyMap(), ByteArrayInputStream(message.toByteArray()))
}
