package al.kaleid.raffi.lan

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi
import org.json.JSONArray
import org.json.JSONObject
import java.net.Inet4Address
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private const val SERVICE_TYPE = "_limbo._tcp"
private const val DISCOVERY_WINDOW_MS = 3_000L

/** Finds computers on the local network that announce Limbo over mDNS. */
class LimboDiscovery(context: Context, private val reply: (JSONObject) -> Unit) {
    private val nsd = context.getSystemService(NsdManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val legacyResolves = ArrayDeque<Pair<NsdServiceInfo, (NsdServiceInfo) -> Unit>>()
    private var legacyResolving = false

    fun discover(message: JSONObject) {
        val id = message.getInt("id")
        val found = ConcurrentHashMap<String, JSONObject>()
        val watching = ConcurrentHashMap.newKeySet<NsdManager.ServiceInfoCallback>()
        val started = AtomicBoolean(true)
        val record: (NsdServiceInfo) -> Unit = { info -> describe(info)?.let { found[it.getString("id")] = it } }
        val listener = object : NsdManager.DiscoveryListener {
            override fun onServiceFound(info: NsdServiceInfo) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) watching += watch(info, record)
                else main.post { resolveLegacy(info, record) }
            }
            override fun onServiceLost(info: NsdServiceInfo) = Unit
            override fun onDiscoveryStarted(serviceType: String) = Unit
            override fun onDiscoveryStopped(serviceType: String) = Unit
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) = started.set(false)
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
        }
        nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        main.postDelayed({
            if (started.get()) nsd.stopServiceDiscovery(listener)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                watching.forEach { callback -> runCatching { nsd.unregisterServiceInfoCallback(callback) } }
            }
            reply(JSONObject().put("type", "response").put("id", id).put("services", JSONArray(found.values)))
        }, DISCOVERY_WINDOW_MS)
    }

    /** Follows a service's addresses as they arrive, until discovery ends; registration can fail, so unregistering may too. */
    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private fun watch(info: NsdServiceInfo, onUpdated: (NsdServiceInfo) -> Unit): NsdManager.ServiceInfoCallback {
        val callback = object : NsdManager.ServiceInfoCallback {
            override fun onServiceUpdated(resolved: NsdServiceInfo) = onUpdated(resolved)
            override fun onServiceInfoCallbackRegistrationFailed(errorCode: Int) = Unit
            override fun onServiceLost() = Unit
            override fun onServiceInfoCallbackUnregistered() = Unit
        }
        nsd.registerServiceInfoCallback(info, executor, callback)
        return callback
    }

    private fun resolveLegacy(info: NsdServiceInfo, onResolved: (NsdServiceInfo) -> Unit) {
        legacyResolves.addLast(info to onResolved)
        resolveNextLegacy()
    }

    /** Before Android 14 NSD resolves one service at a time. */
    @Suppress("DEPRECATION")
    private fun resolveNextLegacy() {
        if (legacyResolving) return
        val (next, onResolved) = legacyResolves.removeFirstOrNull() ?: return
        legacyResolving = true
        nsd.resolveService(next, object : NsdManager.ResolveListener {
            override fun onServiceResolved(resolved: NsdServiceInfo) = finish(resolved)
            override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) = finish(null)

            private fun finish(resolved: NsdServiceInfo?) {
                main.post {
                    resolved?.let(onResolved)
                    legacyResolving = false
                    resolveNextLegacy()
                }
            }
        })
    }

    private fun describe(info: NsdServiceInfo): JSONObject? {
        val instanceId = info.attributes["id"]?.decodeToString() ?: return null
        val host = addresses(info).firstOrNull { it is Inet4Address }?.hostAddress ?: return null
        return JSONObject()
            .put("id", instanceId)
            .put("name", info.serviceName)
            .put("baseUrl", "http://$host:${info.port}")
    }

    @Suppress("DEPRECATION")
    private fun addresses(info: NsdServiceInfo): List<InetAddress> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) info.hostAddresses else listOfNotNull(info.host)
}
