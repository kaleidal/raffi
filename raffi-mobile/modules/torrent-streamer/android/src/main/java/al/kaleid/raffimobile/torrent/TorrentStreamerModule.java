package al.kaleid.raffimobile.torrent;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.libtorrent4j.AlertListener;
import org.libtorrent4j.Priority;
import org.libtorrent4j.SessionManager;
import org.libtorrent4j.SessionParams;
import org.libtorrent4j.SettingsPack;
import org.libtorrent4j.TorrentHandle;
import org.libtorrent4j.TorrentInfo;
import org.libtorrent4j.TorrentStatus;
import org.libtorrent4j.alerts.AddTorrentAlert;
import org.libtorrent4j.alerts.Alert;
import org.libtorrent4j.alerts.AlertType;
import org.libtorrent4j.alerts.MetadataReceivedAlert;
import org.libtorrent4j.alerts.PieceFinishedAlert;
import org.libtorrent4j.alerts.TorrentErrorAlert;
import org.libtorrent4j.alerts.TorrentFinishedAlert;
import org.libtorrent4j.swig.settings_pack;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;

import fi.iki.elonen.NanoHTTPD;

/**
 * React Native module for torrent streaming using libtorrent4j.
 * 
 * This provides on-device torrent streaming with:
 * - Automatic piece prioritization for streaming
 * - Local HTTP server for video playback
 * - Progress and status events
 */
public class TorrentStreamerModule extends ReactContextBaseJavaModule {
    // Inner class for session tracking
    private static class TorrentSession {
        final Object lock = new Object(); // Lock for thread-safe handle access
        String id;
        String magnetUri;
        int requestedFileIndex;
        int selectedFileIndex;
        String infoHash;
        TorrentHandle handle;
        TorrentInfo torrentInfo;
        File saveDir;
        File videoFile;
        long expectedFileSize; // Expected size from torrent metadata
        String streamUrl;
        boolean streamReady = false;
        volatile boolean handleValid = false; // Track handle validity ourselves to avoid native crashes
        volatile boolean removed = false; // Track if session was removed
        
        // Cached progress data from alerts - use this instead of calling native methods
        volatile double cachedProgress = 0;
        volatile int cachedDownloadRate = 0;
        volatile int cachedUploadRate = 0;
        volatile int cachedPeers = 0;
        volatile int cachedSeeds = 0;

        TorrentSession(String id, String magnetUri, int requestedFileIndex) {
            this.id = id;
            this.magnetUri = magnetUri;
            this.requestedFileIndex = requestedFileIndex;
        }
        
        void invalidate() {
            synchronized (lock) {
                this.handleValid = false;
                this.removed = true;
                this.handle = null;
            }
        }
    }
    // Inner class for HTTP streaming server
    private static class StreamingServer extends NanoHTTPD {
        interface RangeRequestListener {
            void onRangeRequested(String sessionId, long start, long end);
        }

        private final Map<String, File> videoFiles = new HashMap<>();
        private final Map<String, Long> expectedFileSizes = new HashMap<>();
        private final String basePath;
        private RangeRequestListener rangeRequestListener;

        StreamingServer(int port, String basePath) {
            super(port);
            this.basePath = basePath;
        }

        @Override
        public Response serve(IHTTPSession session) {
            String uri = session.getUri();
            Log.d("StreamingServer", "Request: " + uri);
            
            if (uri.startsWith("/stream/")) {
                String sessionId = uri.substring("/stream/".length());
                File videoFile = videoFiles.get(sessionId);
                Long expectedSize = expectedFileSizes.get(sessionId);
                
                Log.d("StreamingServer", "SessionId: " + sessionId + ", VideoFile: " + (videoFile != null ? videoFile.getAbsolutePath() : "null"));
                
                if (videoFile == null) {
                    Log.e("StreamingServer", "No video file registered for session: " + sessionId);
                    return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "No file registered");
                }
                
                if (!videoFile.exists()) {
                    Log.e("StreamingServer", "Video file does not exist: " + videoFile.getAbsolutePath());
                    return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "File not found: " + videoFile.getName());
                }
                
                // Use expected size from torrent metadata for Content-Length
                // This allows the video player to know the total duration
                long fileLength = expectedSize != null ? expectedSize : videoFile.length();
                long actualSize = videoFile.length();
                Log.d("StreamingServer", "Serving file: " + videoFile.getName() + ", expected: " + fileLength + ", actual: " + actualSize);

                try {
                    String mimeType = getMimeType(videoFile.getName());
                    
                    // Handle range requests for seeking
                    String rangeHeader = session.getHeaders().get("range");
                    if (rangeHeader != null) {
                        Log.d("StreamingServer", "Range request: " + rangeHeader);
                        return servePartialContent(videoFile, rangeHeader, mimeType, fileLength, sessionId);
                    }

                    // Many players make an initial request without a Range header.
                    // Serving "expected" length with a FileInputStream can EOF early (file isn't downloaded yet),
                    // which causes playback to stall. Treat it as a ranged request from 0 instead.
                    return servePartialContent(videoFile, "bytes=0-", mimeType, fileLength, sessionId);
                } catch (Exception e) {
                    Log.e("StreamingServer", "Error serving file", e);
                    return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", e.getMessage());
                }
            }
            
            return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found");
        }

        void setRangeRequestListener(RangeRequestListener listener) {
            this.rangeRequestListener = listener;
        }

        void setVideoFile(String sessionId, File file, long expectedSize) {
            videoFiles.put(sessionId, file);
            expectedFileSizes.put(sessionId, expectedSize);
        }

        void removeVideoFile(String sessionId) {
            videoFiles.remove(sessionId);
            expectedFileSizes.remove(sessionId);
        }

        private boolean waitForFileSize(File file, long minSizeBytes, long timeoutMs) {
            long start = System.currentTimeMillis();
            while (System.currentTimeMillis() - start < timeoutMs) {
                long len = file.length();
                if (len >= minSizeBytes) return true;
                try {
                    Thread.sleep(200);
                } catch (InterruptedException e) {
                    return false;
                }
            }
            return false;
        }

        private Response servePartialContent(File file, String rangeHeader, String mimeType, long fileLength, String sessionId) {
            try {
                long start = 0;
                long end = fileLength - 1;
                
                String range = rangeHeader.replace("bytes=", "");
                String[] parts = range.split("-");
                
                if (parts.length > 0 && !parts[0].isEmpty()) {
                    start = Long.parseLong(parts[0]);
                }
                if (parts.length > 1 && !parts[1].isEmpty()) {
                    end = Long.parseLong(parts[1]);
                }
                
                // Limit chunk size to 2MB for streaming
                long maxChunk = 2 * 1024 * 1024;
                if (end - start + 1 > maxChunk) {
                    end = start + maxChunk - 1;
                }

                // Notify listener so the torrent layer can prioritize pieces for this range
                if (rangeRequestListener != null) {
                    try {
                        rangeRequestListener.onRangeRequested(sessionId, start, end);
                    } catch (Exception e) {
                        Log.w("StreamingServer", "RangeRequestListener failed: " + e.getMessage());
                    }
                }
                
                // Make sure we don't read past actual file size on disk
                long actualFileSize = file.length();
                if (start >= actualFileSize) {
                    // The player is requesting bytes that aren't downloaded yet.
                    // Wait briefly for the file to grow instead of returning 416 (often treated as fatal).
                    Log.d("StreamingServer", "Waiting for buffered data. start=" + start + ", actual=" + actualFileSize);
                    boolean ok = waitForFileSize(file, start + 1, 10_000);
                    if (!ok) {
                        Response resp = newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE, "text/plain",
                            "Not enough data buffered yet");
                        resp.addHeader("Retry-After", "1");
                        resp.addHeader("Accept-Ranges", "bytes");
                        return resp;
                    }
                    actualFileSize = file.length();
                }
                if (end >= actualFileSize) {
                    end = actualFileSize - 1;
                }
                
                long contentLength = end - start + 1;
                
                Log.d("StreamingServer", "Serving range " + start + "-" + end + " of " + fileLength + " (actual: " + actualFileSize + ")");
                
                java.io.RandomAccessFile raf = new java.io.RandomAccessFile(file, "r");
                raf.seek(start);
                
                byte[] buffer = new byte[(int) contentLength];
                int bytesRead = raf.read(buffer);
                raf.close();
                
                if (bytesRead < contentLength) {
                    Log.w("StreamingServer", "Only read " + bytesRead + " of " + contentLength + " bytes");
                    // Truncate buffer to actual bytes read
                    if (bytesRead > 0) {
                        byte[] truncated = new byte[bytesRead];
                        System.arraycopy(buffer, 0, truncated, 0, bytesRead);
                        buffer = truncated;
                        contentLength = bytesRead;
                        end = start + bytesRead - 1;
                    }
                }
                
                Response response = newFixedLengthResponse(
                    Response.Status.PARTIAL_CONTENT, 
                    mimeType, 
                    new java.io.ByteArrayInputStream(buffer), 
                    contentLength
                );
                response.addHeader("Content-Range", "bytes " + start + "-" + end + "/" + fileLength);
                response.addHeader("Accept-Ranges", "bytes");
                
                return response;
            } catch (Exception e) {
                Log.e("StreamingServer", "Error serving partial content", e);
                return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", e.getMessage());
            }
        }

        private String getMimeType(String filename) {
            String lower = filename.toLowerCase();
            if (lower.endsWith(".mp4")) return "video/mp4";
            if (lower.endsWith(".mkv")) return "video/x-matroska";
            if (lower.endsWith(".avi")) return "video/x-msvideo";
            if (lower.endsWith(".webm")) return "video/webm";
            if (lower.endsWith(".mov")) return "video/quicktime";
            if (lower.endsWith(".m4v")) return "video/x-m4v";
            return "video/mp4";
        }
    }
    private static final String TAG = "TorrentStreamer";

    private static final String MODULE_NAME = "TorrentStreamer";
    private static final int PREPARE_PIECES = 10; // pieces to download before ready (increased for reliability)
    private final ReactApplicationContext reactContext;
    private SessionManager sessionManager;
    private StreamingServer streamingServer;
    private final Map<String, TorrentSession> sessions = new HashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private String downloadPath;

    private int serverPort = 8765;

    private Timer progressTimer;

    public TorrentStreamerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void initialize(ReadableMap config, Promise promise) {
        try {
            downloadPath = config.hasKey("downloadPath") 
                ? config.getString("downloadPath") 
                : reactContext.getCacheDir().getAbsolutePath() + "/torrents";

            File downloadDir = new File(downloadPath);
            if (!downloadDir.exists()) {
                downloadDir.mkdirs();
            }

            // Configure libtorrent4j session
            SettingsPack settings = new SettingsPack();
            settings.activeDownloads(3);
            settings.activeSeeds(3);
            settings.activeLimit(5);
            settings.connectionsLimit(config.hasKey("maxConnections") ? config.getInt("maxConnections") : 200);
            
            int downloadLimit = config.hasKey("maxDownloadSpeed") ? config.getInt("maxDownloadSpeed") : 0;
            int uploadLimit = config.hasKey("maxUploadSpeed") ? config.getInt("maxUploadSpeed") : 50 * 1024;
            settings.downloadRateLimit(downloadLimit);
            settings.uploadRateLimit(uploadLimit);
            
            // Enable DHT for peer discovery
            settings.setEnableDht(true);
            
            // Enable LSD and PEX for better peer discovery
            settings.setBoolean(settings_pack.bool_types.enable_lsd.swigValue(), true);
            
            // Prefer IPv4 since IPv6 often fails on mobile networks
            settings.setBoolean(settings_pack.bool_types.prefer_rc4.swigValue(), true);
            
            // Listen only on IPv4 to avoid IPv6 issues
            settings.setString(settings_pack.string_types.listen_interfaces.swigValue(), "0.0.0.0:6881");
            
            // Anonymous mode for privacy
            settings.anonymousMode(false);

            sessionManager = new SessionManager();
            
            // Add alert listener BEFORE starting the session
            sessionManager.addListener(new AlertListener() {
                @Override
                public int[] types() {
                    return null; // Listen to all alerts
                }

                @Override
                public void alert(Alert<?> alert) {
                    handleAlert(alert);
                }
            });
            
            sessionManager.start(new SessionParams(settings));
            
            // Wait for session to be running
            Thread.sleep(500);
            
            // Add DHT bootstrap nodes for peer discovery
            Log.i(TAG, "Adding DHT bootstrap nodes...");
            org.libtorrent4j.swig.session swig = sessionManager.swig();
            if (swig != null) {
                // Common DHT bootstrap nodes
                swig.add_dht_node(new org.libtorrent4j.swig.string_int_pair("router.bittorrent.com", 6881));
                swig.add_dht_node(new org.libtorrent4j.swig.string_int_pair("router.utorrent.com", 6881));
                swig.add_dht_node(new org.libtorrent4j.swig.string_int_pair("dht.transmissionbt.com", 6881));
                swig.add_dht_node(new org.libtorrent4j.swig.string_int_pair("dht.libtorrent.org", 25401));
                Log.i(TAG, "Added DHT bootstrap nodes");
            }

            // Start local streaming server
            startStreamingServer();

            // Start progress update timer
            startProgressTimer();

            Log.i(TAG, "TorrentStreamer initialized with libtorrent4j");
            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize TorrentStreamer", e);
            promise.reject("INIT_ERROR", "Failed to initialize torrent streamer: " + e.getMessage());
        }
    }

    @ReactMethod
    public void startStream(ReadableMap params, Promise promise) {
        try {
            String sessionId = params.getString("sessionId");
            String magnetUri = params.getString("magnetUri");
            int fileIndex = params.hasKey("fileIndex") ? params.getInt("fileIndex") : -1;

            if (sessionManager == null || !sessionManager.isRunning()) {
                promise.reject("NOT_INITIALIZED", "TorrentStreamer not initialized");
                return;
            }

            TorrentSession session = new TorrentSession(sessionId, magnetUri, fileIndex);
            sessions.put(sessionId, session);

            new Thread(() -> {
                try {
                    // Use per-session download directory so we can purge on exit and avoid cross-session pollution.
                    File saveDir = new File(downloadPath, sessionId);
                    if (!saveDir.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        saveDir.mkdirs();
                    }
                    session.saveDir = saveDir;
                    
                    Log.i(TAG, "Starting torrent download for session: " + sessionId);
                    Log.i(TAG, "Magnet URI: " + magnetUri.substring(0, Math.min(100, magnetUri.length())) + "...");
                    
                    // First, remove any existing torrent with the same hash to ensure fresh start
                    // This prevents issues with stale piece data from previous downloads
                    String tempHash = extractInfoHashFromMagnet(magnetUri);
                    if (tempHash != null) {
                        // First invalidate any sessions that reference this hash
                        for (TorrentSession existingSession : sessions.values()) {
                            if (tempHash.equalsIgnoreCase(existingSession.infoHash)) {
                                Log.i(TAG, "Invalidating existing session with same hash: " + existingSession.id);
                                existingSession.invalidate();
                            }
                        }
                        
                        for (org.libtorrent4j.swig.torrent_handle swigHandle : sessionManager.swig().get_torrents()) {
                            TorrentHandle existingHandle = new TorrentHandle(swigHandle);
                            if (tempHash.equalsIgnoreCase(existingHandle.infoHash().toHex())) {
                                Log.i(TAG, "Removing existing torrent with same hash");
                                sessionManager.remove(existingHandle);
                                Thread.sleep(500); // Wait for removal to complete
                                break;
                            }
                        }
                    }
                    
                    // Enhance magnet with public trackers if it doesn't have any
                    String enhancedMagnet = enhanceMagnetWithTrackers(magnetUri);
                    Log.i(TAG, "Enhanced magnet with trackers");
                    
                    // Download magnet URI using the correct overload
                    org.libtorrent4j.swig.torrent_flags_t defaultFlags = new org.libtorrent4j.swig.torrent_flags_t();
                    sessionManager.download(enhancedMagnet, saveDir, defaultFlags);
                    
                    // Wait for handle to be available
                    Thread.sleep(1000);
                    
                    // Find the handle by iterating active torrents
                    for (org.libtorrent4j.swig.torrent_handle swigHandle : sessionManager.swig().get_torrents()) {
                        TorrentHandle handle = new TorrentHandle(swigHandle);
                        session.handle = handle;
                        session.handleValid = true;  // Mark handle as valid
                        session.infoHash = handle.infoHash().toHex();
                        Log.i(TAG, "Torrent handle found, infoHash: " + session.infoHash);
                        break;
                    }
                    
                    // Generate stream URL early so JS can have it
                    String streamUrl = "http://127.0.0.1:" + serverPort + "/stream/" + sessionId;
                    session.streamUrl = streamUrl;
                    
                    mainHandler.post(() -> {
                        WritableMap result = Arguments.createMap();
                        result.putString("sessionId", sessionId);
                        result.putString("streamUrl", streamUrl);
                        result.putString("status", "loading");
                        promise.resolve(result);
                    });
                    
                } catch (Exception e) {
                    mainHandler.post(() -> {
                        promise.reject("STREAM_ERROR", "Failed to start stream: " + e.getMessage());
                    });
                }
            }).start();

        } catch (Exception e) {
            Log.e(TAG, "Failed to start stream", e);
            promise.reject("STREAM_ERROR", "Failed to start stream: " + e.getMessage());
        }
    }

    @ReactMethod
    public void stopStream(String sessionId, Promise promise) {
        try {
            TorrentSession session = sessions.remove(sessionId);
            if (session != null) {
                // Capture handle before invalidating (invalidate() clears it).
                TorrentHandle handleToRemove = session.handle;
                File dirToDelete = session.saveDir;

                // Invalidate session BEFORE removing torrent to reduce risk of alert races
                session.invalidate();

                if (handleToRemove != null && sessionManager != null) {
                    try {
                        sessionManager.remove(handleToRemove);
                    } catch (Exception e) {
                        Log.w(TAG, "Error removing torrent (may already be removed): " + e.getMessage());
                    }
                }

                // Purge downloaded data for this session
                if (dirToDelete != null) {
                    deleteRecursive(dirToDelete);
                }
            }
            if (streamingServer != null) {
                streamingServer.removeVideoFile(sessionId);
            }
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("STOP_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void stopAll(Promise promise) {
        try {
            for (TorrentSession session : sessions.values()) {
                TorrentHandle handleToRemove = session.handle;
                File dirToDelete = session.saveDir;

                // Invalidate session BEFORE removing torrent
                session.invalidate();

                if (handleToRemove != null && sessionManager != null) {
                    try {
                        sessionManager.remove(handleToRemove);
                    } catch (Exception e) {
                        Log.w(TAG, "Error removing torrent (may already be removed): " + e.getMessage());
                    }
                }

                if (dirToDelete != null) {
                    deleteRecursive(dirToDelete);
                }
            }
            sessions.clear();
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("STOP_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getSessionInfo(String sessionId, Promise promise) {
        try {
            TorrentSession session = sessions.get(sessionId);
            if (session == null) {
                promise.reject("NOT_FOUND", "Session not found");
                return;
            }

            WritableMap info = Arguments.createMap();
            info.putString("sessionId", sessionId);
            info.putString("streamUrl", session.streamUrl);
            info.putBoolean("ready", session.streamReady);
            
            // Use cached progress data instead of calling native methods
            info.putDouble("progress", session.cachedProgress);
            info.putInt("downloadSpeed", session.cachedDownloadRate);
            info.putInt("peers", session.cachedPeers);

            promise.resolve(info);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Required for RN event emitter
    }

    @ReactMethod
    public void removeListeners(int count) {
        // Required for RN event emitter
    }

    @Override
    public void invalidate() {
        super.invalidate();
        
        if (progressTimer != null) {
            progressTimer.cancel();
            progressTimer = null;
        }
        
        if (streamingServer != null) {
            streamingServer.stop();
            streamingServer = null;
        }
        
        if (sessionManager != null) {
            sessionManager.stop();
            sessionManager = null;
        }
        
        sessions.clear();
    }

    private void handleAlert(Alert<?> alert) {
        try {
            AlertType type = alert.type();
            
            // Log all alerts for debugging
            if (type != AlertType.DHT_STATS && type != AlertType.SESSION_STATS) {
                Log.d(TAG, "Alert received: " + type.name() + " - " + alert.message());
            }

            switch (type) {
                case ADD_TORRENT:
                    AddTorrentAlert addAlert = (AddTorrentAlert) alert;
                    handleTorrentAdded(addAlert);
                    break;

                case METADATA_RECEIVED:
                    MetadataReceivedAlert metaAlert = (MetadataReceivedAlert) alert;
                    handleMetadataReceived(metaAlert);
                    break;

                case PIECE_FINISHED:
                    PieceFinishedAlert pieceAlert = (PieceFinishedAlert) alert;
                    handlePieceFinished(pieceAlert);
                    break;

                case TORRENT_ERROR:
                    TorrentErrorAlert errorAlert = (TorrentErrorAlert) alert;
                    handleTorrentError(errorAlert);
                    break;

                case TORRENT_FINISHED:
                    TorrentFinishedAlert finishedAlert = (TorrentFinishedAlert) alert;
                    handleTorrentFinished(finishedAlert);
                    break;

                default:
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling alert: " + e.getMessage(), e);
        }
    }

    private void handleTorrentAdded(AddTorrentAlert alert) {
        if (alert.error().isError()) {
            Log.e(TAG, "Error adding torrent: " + alert.error().toString());
            return;
        }
        Log.i(TAG, "Torrent added: " + alert.torrentName());
    }

    private void handleMetadataReceived(MetadataReceivedAlert alert) {
        try {
            TorrentHandle handle = alert.handle();
            if (handle == null) return;
            
            // Get infoHash first before any other native calls
            String infoHash;
            try {
                infoHash = handle.infoHash().toHex();
            } catch (Exception e) {
                Log.w(TAG, "Failed to get infoHash from alert handle: " + e.getMessage());
                return;
            }
            
            Log.i(TAG, "Metadata received for infoHash: " + infoHash);
            
            TorrentSession session = findSessionByInfoHash(infoHash);
            if (session == null) {
                Log.w(TAG, "No session found for infoHash: " + infoHash);
                return;
            }
            
            // Check if our session is still valid before proceeding
            if (session.removed || !session.handleValid) {
                Log.w(TAG, "Session was invalidated, ignoring metadata alert");
                return;
            }

            TorrentInfo torrentInfo = handle.torrentFile();
            if (torrentInfo == null) {
                Log.w(TAG, "torrentFile() returned null");
                return;
            }

            Log.i(TAG, "Torrent name: " + torrentInfo.name());
            Log.i(TAG, "Num files: " + torrentInfo.numFiles());
            Log.i(TAG, "Num pieces: " + torrentInfo.numPieces());

            // Select the video file
            int fileIndex = selectVideoFileIndex(torrentInfo, session.requestedFileIndex);
            session.selectedFileIndex = fileIndex;
            session.torrentInfo = torrentInfo;

            Log.i(TAG, "Selected file index: " + fileIndex);
            Log.i(TAG, "Selected file path: " + torrentInfo.files().filePath(fileIndex));
            Log.i(TAG, "Selected file size: " + torrentInfo.files().fileSize(fileIndex));

            // Get file info - note: file won't exist until pieces download
            File baseDir = session.saveDir != null ? session.saveDir : new File(downloadPath);
            File videoFile = new File(baseDir, torrentInfo.files().filePath(fileIndex));
            long expectedFileSize = torrentInfo.files().fileSize(fileIndex);
            session.videoFile = videoFile;
            session.expectedFileSize = expectedFileSize;
            streamingServer.setVideoFile(session.id, videoFile, expectedFileSize);

            // Prioritize pieces for streaming
            prioritizePiecesForStreaming(handle, torrentInfo, fileIndex);

            String streamUrl = "http://127.0.0.1:" + serverPort + "/stream/" + session.id;
            session.streamUrl = streamUrl;

            Log.i(TAG, "Metadata received, stream URL: " + streamUrl);
            
            sendEvent("onTorrentReady", createReadyEvent(session.id, streamUrl, torrentInfo.name(), 
                torrentInfo.files().fileSize(fileIndex)));
        } catch (Exception e) {
            Log.w(TAG, "Error in handleMetadataReceived: " + e.getMessage());
        }
    }

    private void prioritizePiecesForStreaming(TorrentHandle handle, TorrentInfo info, int fileIndex) {
        int numPieces = info.numPieces();
        long fileOffset = info.files().fileOffset(fileIndex);
        long fileSize = info.files().fileSize(fileIndex);
        int pieceLength = info.pieceLength();

        int firstPiece = (int) (fileOffset / pieceLength);
        int lastPiece = (int) ((fileOffset + fileSize - 1) / pieceLength);

        Log.i(TAG, "File prioritization: fileOffset=" + fileOffset + ", fileSize=" + fileSize + 
              ", pieceLength=" + pieceLength + ", firstPiece=" + firstPiece + ", lastPiece=" + lastPiece);

        // Set all pieces to low priority first (Priority.LOW = 1)
        for (int i = 0; i < numPieces; i++) {
            handle.piecePriority(i, Priority.LOW);
        }

        // Set file pieces to normal priority (Priority.DEFAULT = 4)
        for (int i = firstPiece; i <= lastPiece; i++) {
            handle.piecePriority(i, Priority.DEFAULT);
        }

        // Set first few pieces to highest priority for quick start (Priority.TOP_PRIORITY = 7)
        int prepareEnd = Math.min(firstPiece + PREPARE_PIECES, lastPiece);
        for (int i = firstPiece; i <= prepareEnd; i++) {
            handle.piecePriority(i, Priority.TOP_PRIORITY);
            handle.setPieceDeadline(i, 1000); // 1 second deadline
        }

        // Also prioritize last pieces (for video duration detection)
        int lastPrepare = Math.max(lastPiece - 2, firstPiece);
        for (int i = lastPrepare; i <= lastPiece; i++) {
            handle.piecePriority(i, Priority.TOP_PRIORITY);
        }

        Log.i(TAG, "Prioritized pieces " + firstPiece + " to " + prepareEnd + " (TOP_PRIORITY), last pieces " + lastPrepare + " to " + lastPiece);
    }

    private void handlePieceFinished(PieceFinishedAlert alert) {
        try {
            TorrentHandle handle = alert.handle();
            if (handle == null) return;
            
            // Get infoHash first before any other native calls
            String infoHash;
            try {
                infoHash = handle.infoHash().toHex();
            } catch (Exception e) {
                Log.w(TAG, "Failed to get infoHash from alert handle: " + e.getMessage());
                return;
            }
            
            TorrentSession session = findSessionByInfoHash(infoHash);
            
            if (session == null) return;
            
            // Check if our session is still valid before proceeding
            if (session.removed || !session.handleValid) {
                return;
            }

            // Refresh cached progress from this alert thread (avoid doing this in the timer thread)
            try {
                TorrentStatus status = handle.status();
                if (status != null) {
                    session.cachedProgress = status.progress() * 100;
                    session.cachedDownloadRate = status.downloadRate();
                    session.cachedUploadRate = status.uploadRate();
                    session.cachedPeers = status.numPeers();
                    session.cachedSeeds = status.numSeeds();
                }
            } catch (Exception e) {
                // Ignore - handle may be in transient state
            }
            
            if (session.streamReady) return;

            // Check if we have enough pieces to start streaming
            if (session.torrentInfo != null) {
                int pieceLength = session.torrentInfo.pieceLength();
                long fileOffset = session.torrentInfo.files().fileOffset(session.selectedFileIndex);
                int firstPiece = (int) (fileOffset / pieceLength);
                int lastFilePiece = (int) ((fileOffset + session.torrentInfo.files().fileSize(session.selectedFileIndex)) / pieceLength);
            
            // Log which pieces we're checking
            Log.d(TAG, "Piece finished alert - Piece: " + alert.pieceIndex() + 
                       ", FirstPiece: " + firstPiece + ", LastFilePiece: " + lastFilePiece +
                       ", Checking pieces " + firstPiece + " to " + (firstPiece + PREPARE_PIECES - 1));
            
            boolean ready = true;
            StringBuilder missingPieces = new StringBuilder();
            for (int i = firstPiece; i < firstPiece + PREPARE_PIECES && i < session.torrentInfo.numPieces(); i++) {
                if (!handle.havePiece(i)) {
                    ready = false;
                    missingPieces.append(i).append(" ");
                }
            }
            
            if (!ready) {
                Log.d(TAG, "Not ready yet, missing pieces: " + missingPieces.toString());
            }

            // Also check if the file exists on disk and has readable content
            if (ready && session.videoFile != null) {
                if (!session.videoFile.exists()) {
                    Log.d(TAG, "Pieces ready but file doesn't exist yet: " + session.videoFile.getAbsolutePath());
                    ready = false;
                } else if (session.videoFile.length() == 0) {
                    Log.d(TAG, "File exists but is empty: " + session.videoFile.getAbsolutePath());
                    ready = false;
                } else {
                    // Verify we can actually read non-zero bytes from the start of the file
                    // This catches cases where libtorrent has the file but hasn't written the first bytes yet
                    ready = verifyFileReadable(session.videoFile, pieceLength);
                    if (!ready) {
                        Log.d(TAG, "File exists but first bytes not yet readable");
                    }
                }
            }

            if (ready && !session.streamReady) {
                session.streamReady = true;
                Log.i(TAG, "Stream ready for playback! File: " + session.videoFile.getAbsolutePath());
                Log.i(TAG, "File exists: " + session.videoFile.exists() + ", size: " + session.videoFile.length());
                sendEvent("onStreamReady", createStreamReadyEvent(session.id, session.streamUrl));
            }
        }
        } catch (Exception e) {
            Log.w(TAG, "Error in handlePieceFinished: " + e.getMessage());
        }
    }

    private void handleTorrentError(TorrentErrorAlert alert) {
        try {
            TorrentHandle handle = alert.handle();
            if (handle == null) return;
            
            // Get infoHash first before any other native calls
            String infoHash;
            try {
                infoHash = handle.infoHash().toHex();
            } catch (Exception e) {
                Log.w(TAG, "Failed to get infoHash from error alert: " + e.getMessage());
                return;
            }
            
            TorrentSession session = findSessionByInfoHash(infoHash);
            
            if (session != null && !session.removed) {
                String error = alert.error().toString();
                Log.e(TAG, "Torrent error: " + error);
                sendEvent("onTorrentError", createErrorEvent(session.id, error));
            }
        } catch (Exception e) {
            Log.w(TAG, "Error in handleTorrentError: " + e.getMessage());
        }
    }

    /**
     * Verify that the file is actually readable and contains non-zero video data.
     * This catches cases where libtorrent has pre-allocated the file but hasn't written
     * the first pieces yet, or where cached piece metadata is stale.
     */
    private boolean verifyFileReadable(File file, int pieceLength) {
        try {
            // Read first 64KB and verify it's not all zeros
            int checkSize = Math.min(64 * 1024, pieceLength);
            byte[] buffer = new byte[checkSize];
            
            java.io.RandomAccessFile raf = new java.io.RandomAccessFile(file, "r");
            int bytesRead = raf.read(buffer);
            raf.close();
            
            if (bytesRead < checkSize) {
                Log.d(TAG, "File read returned only " + bytesRead + " bytes, expected " + checkSize);
                return false;
            }
            
            // Check for video file signatures (magic bytes)
            // MP4/MOV: starts with ftyp box (offset 4-7 = "ftyp")
            // MKV/WebM: starts with 0x1A 0x45 0xDF 0xA3
            // AVI: starts with "RIFF"
            
            boolean hasVideoSignature = false;
            
            // Check MP4/MOV (ftyp at offset 4)
            if (bytesRead >= 8) {
                String ftyp = new String(buffer, 4, 4);
                if ("ftyp".equals(ftyp)) {
                    hasVideoSignature = true;
                    Log.d(TAG, "Detected MP4/MOV file signature");
                }
            }
            
            // Check MKV/WebM
            if (!hasVideoSignature && bytesRead >= 4) {
                if (buffer[0] == 0x1A && buffer[1] == 0x45 && buffer[2] == (byte)0xDF && buffer[3] == (byte)0xA3) {
                    hasVideoSignature = true;
                    Log.d(TAG, "Detected MKV/WebM file signature");
                }
            }
            
            // Check AVI
            if (!hasVideoSignature && bytesRead >= 4) {
                String riff = new String(buffer, 0, 4);
                if ("RIFF".equals(riff)) {
                    hasVideoSignature = true;
                    Log.d(TAG, "Detected AVI file signature");
                }
            }
            
            if (!hasVideoSignature) {
                // Fallback: check if data is not all zeros
                int nonZeroCount = 0;
                for (int i = 0; i < Math.min(1024, bytesRead); i++) {
                    if (buffer[i] != 0) nonZeroCount++;
                }
                // If more than 10% is non-zero, consider it readable
                hasVideoSignature = (nonZeroCount > 100);
                if (hasVideoSignature) {
                    Log.d(TAG, "File has non-zero data (" + nonZeroCount + " non-zero bytes in first 1KB)");
                } else {
                    Log.d(TAG, "File appears to be mostly zeros (" + nonZeroCount + " non-zero bytes in first 1KB)");
                }
            }
            
            return hasVideoSignature;
        } catch (Exception e) {
            Log.e(TAG, "Error verifying file readability", e);
            return false;
        }
    }

    private void handleTorrentFinished(TorrentFinishedAlert alert) {
        try {
            TorrentHandle handle = alert.handle();
            if (handle == null) return;
            
            // Get infoHash first before any other native calls
            String infoHash;
            try {
                infoHash = handle.infoHash().toHex();
            } catch (Exception e) {
                Log.w(TAG, "Failed to get infoHash from finished alert: " + e.getMessage());
                return;
            }
            
            TorrentSession session = findSessionByInfoHash(infoHash);
            
            if (session != null && !session.removed) {
                // Mark cached progress as complete
                session.cachedProgress = 100;
                Log.i(TAG, "Torrent finished: " + session.id);
                sendEvent("onTorrentFinished", createFinishedEvent(session.id));
            }
        } catch (Exception e) {
            Log.w(TAG, "Error in handleTorrentFinished: " + e.getMessage());
        }
    }

    private TorrentSession findSessionByInfoHash(String infoHash) {
        for (TorrentSession session : sessions.values()) {
            if (infoHash.equals(session.infoHash)) {
                return session;
            }
        }
        return null;
    }

    private int selectVideoFileIndex(TorrentInfo info, int requestedIndex) {
        int numFiles = info.files().numFiles();
        
        if (requestedIndex >= 0 && requestedIndex < numFiles) {
            return requestedIndex;
        }

        // Auto-select largest video file
        String[] videoExtensions = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".m4v"};
        int largestIndex = 0;
        long largestSize = 0;

        for (int i = 0; i < numFiles; i++) {
            String path = info.files().filePath(i).toLowerCase();
            long size = info.files().fileSize(i);
            
            for (String ext : videoExtensions) {
                if (path.endsWith(ext) && size > largestSize) {
                    largestIndex = i;
                    largestSize = size;
                    break;
                }
            }
        }

        return largestIndex;
    }

    private void startStreamingServer() {
        try {
            if (streamingServer != null) {
                streamingServer.stop();
            }
            streamingServer = new StreamingServer(serverPort, downloadPath);
            streamingServer.setRangeRequestListener((sessionId, start, end) -> {
                try {
                    prioritizePiecesForRange(sessionId, start);
                } catch (Exception e) {
                    Log.w(TAG, "Failed to prioritize pieces for range: " + e.getMessage());
                }
            });
            streamingServer.start();
            Log.i(TAG, "Streaming server started on port " + serverPort);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start streaming server", e);
        }
    }

    /**
     * When the video player requests a byte range, prioritize torrent pieces around that offset.
     * This is critical for seeking/resume, otherwise libtorrent may keep downloading from the start.
     */
    private void prioritizePiecesForRange(String sessionId, long rangeStartBytes) {
        TorrentSession session = sessions.get(sessionId);
        if (session == null) return;
        if (session.removed || !session.handleValid) return;
        if (session.handle == null || session.torrentInfo == null) return;
        if (session.selectedFileIndex < 0) return;

        try {
            TorrentInfo info = session.torrentInfo;
            TorrentHandle handle = session.handle;

            int pieceLength = info.pieceLength();
            long fileOffset = info.files().fileOffset(session.selectedFileIndex);
            long fileSize = info.files().fileSize(session.selectedFileIndex);
            int firstPiece = (int) (fileOffset / pieceLength);
            int lastPiece = (int) ((fileOffset + fileSize - 1) / pieceLength);

            long absoluteOffset = fileOffset + Math.max(0, rangeStartBytes);
            int targetPiece = (int) (absoluteOffset / pieceLength);
            if (targetPiece < firstPiece) targetPiece = firstPiece;
            if (targetPiece > lastPiece) targetPiece = lastPiece;

            int windowBefore = 4;
            int windowAfter = 30;
            int from = Math.max(firstPiece, targetPiece - windowBefore);
            int to = Math.min(lastPiece, targetPiece + windowAfter);

            for (int i = from; i <= to; i++) {
                try {
                    handle.piecePriority(i, Priority.TOP_PRIORITY);
                    handle.setPieceDeadline(i, 750);
                } catch (Exception ignored) {
                    // ignore per-piece failures
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "prioritizePiecesForRange error: " + e.getMessage());
        }
    }

    private void startProgressTimer() {
        if (progressTimer != null) {
            progressTimer.cancel();
        }
        progressTimer = new Timer();
        progressTimer.scheduleAtFixedRate(new TimerTask() {
            @Override
            public void run() {
                updateProgress();
            }
        }, 1000, 1000);
    }

    private void updateProgress() {
        if (sessionManager == null) return;

        // Create a copy of sessions to avoid concurrent modification
        List<TorrentSession> sessionList = new ArrayList<>(sessions.values());
        
        for (TorrentSession session : sessionList) {
            // Skip removed sessions
            if (session.removed) {
                continue;
            }
            
            // Use CACHED progress data only - NEVER call native methods from timer thread
            // This avoids race conditions where handle becomes invalid between check and use
            sendEvent("onTorrentProgress", createProgressEvent(
                session.id,
                session.cachedProgress,
                session.cachedDownloadRate,
                session.cachedUploadRate,
                session.cachedPeers,
                session.cachedSeeds
            ));
        }
    }

    /**
     * Enhance a magnet URI with public trackers to improve peer discovery.
     * This helps when the original magnet doesn't include trackers.
     */
    private String enhanceMagnetWithTrackers(String magnetUri) {
        // Public trackers that are commonly reliable
        String[] publicTrackers = {
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://open.stealth.si:80/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://tracker.bittor.pw:1337/announce",
            "udp://public.popcorn-tracker.org:6969/announce",
            "udp://tracker.dler.org:6969/announce",
            "udp://exodus.desync.com:6969/announce",
            "udp://open.demonii.com:1337/announce",
            "http://tracker.opentrackr.org:1337/announce"
        };
        
        StringBuilder enhanced = new StringBuilder(magnetUri);
        
        for (String tracker : publicTrackers) {
            // Only add if not already present
            if (!magnetUri.contains(tracker)) {
                try {
                    enhanced.append("&tr=").append(java.net.URLEncoder.encode(tracker, "UTF-8"));
                } catch (Exception e) {
                    enhanced.append("&tr=").append(tracker);
                }
            }
        }
        
        return enhanced.toString();
    }

    private void deleteRecursive(File fileOrDir) {
        try {
            if (fileOrDir == null || !fileOrDir.exists()) return;
            if (fileOrDir.isDirectory()) {
                File[] children = fileOrDir.listFiles();
                if (children != null) {
                    for (File c : children) {
                        deleteRecursive(c);
                    }
                }
            }
            //noinspection ResultOfMethodCallIgnored
            fileOrDir.delete();
        } catch (Exception e) {
            Log.w(TAG, "Failed to delete " + (fileOrDir != null ? fileOrDir.getAbsolutePath() : "null") + ": " + e.getMessage());
        }
    }

    private void sendEvent(String eventName, WritableMap params) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
        }
    }

    private WritableMap createProgressEvent(String sessionId, double progress, int downloadSpeed, 
            int uploadSpeed, int peers, int seeds) {
        WritableMap event = Arguments.createMap();
        event.putString("sessionId", sessionId);
        event.putDouble("progress", progress);
        event.putInt("downloadSpeed", downloadSpeed);
        event.putInt("uploadSpeed", uploadSpeed);
        event.putInt("peers", peers);
        event.putInt("seeds", seeds);
        return event;
    }

    private WritableMap createReadyEvent(String sessionId, String streamUrl, String name, long fileSize) {
        WritableMap event = Arguments.createMap();
        event.putString("sessionId", sessionId);
        event.putString("streamUrl", streamUrl);
        
        WritableMap info = Arguments.createMap();
        info.putString("name", name);
        info.putDouble("fileSize", fileSize);
        event.putMap("info", info);
        
        return event;
    }

    private WritableMap createStreamReadyEvent(String sessionId, String streamUrl) {
        WritableMap event = Arguments.createMap();
        event.putString("sessionId", sessionId);
        event.putString("streamUrl", streamUrl);
        return event;
    }

    private WritableMap createErrorEvent(String sessionId, String error) {
        WritableMap event = Arguments.createMap();
        event.putString("sessionId", sessionId);
        event.putString("error", error);
        return event;
    }

    private WritableMap createFinishedEvent(String sessionId) {
        WritableMap event = Arguments.createMap();
        event.putString("sessionId", sessionId);
        event.putBoolean("finished", true);
        return event;
    }

    /**
     * Extract info hash from magnet URI for deduplication.
     */
    private String extractInfoHashFromMagnet(String magnetUri) {
        // Magnet format: magnet:?xt=urn:btih:INFOHASH&...
        try {
            if (magnetUri == null) return null;
            String lower = magnetUri.toLowerCase();
            int idx = lower.indexOf("xt=urn:btih:");
            if (idx == -1) return null;
            
            int start = idx + 12; // length of "xt=urn:btih:"
            int end = magnetUri.indexOf('&', start);
            if (end == -1) end = magnetUri.length();
            
            String hash = magnetUri.substring(start, end);
            // Handle base32 encoded hashes (40 chars = hex, 32 chars = base32)
            if (hash.length() == 32) {
                // Base32 decode - for now just return as-is, libtorrent will handle it
                return hash.toUpperCase();
            }
            return hash.toLowerCase();
        } catch (Exception e) {
            Log.w(TAG, "Failed to extract info hash from magnet", e);
            return null;
        }
    }
}
