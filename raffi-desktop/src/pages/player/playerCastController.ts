import {
    connectAndLoadCast,
    createCastBootstrap,
    disconnectCast,
    pauseCast,
    playCast,
    seekCast,
    setCastVolume,
    stopCast,
} from "../../lib/cast";

type TrackEvent = (name: string, payload?: Record<string, unknown>) => void;

type CastMetadata = {
    title?: string;
    subtitle?: string;
    cover?: string;
    background?: string;
    durationSeconds?: number;
};

type CastMode = "native" | "chrome";

type CreatePlayerCastControllerDeps = {
    getSessionId: () => string;
    isCastActive: () => boolean;
    isCastBusy: () => boolean;
    setCastBusy: (busy: boolean) => void;
    setCastActive: (active: boolean) => void;
    setCastDeviceName: (name: string) => void;
    setCastTransport: (mode: CastMode | null) => void;
    getCastTransport: () => CastMode | null;
    setHasStarted: (started: boolean) => void;
    getCurrentTime: () => number;
    getPlaybackOffset: () => number;
    setCurrentTime: (time: number) => void;
    setVolumeLevel: (level: number) => void;
    setIsPlaying: (playing: boolean) => void;
    setPendingSeek: (time: number | null) => void;
    pauseLocalVideo: () => void;
    showDeviceScanLoading: (mode: CastMode) => void;
    hideDevicePicker: () => void;
    showAlert: (message: string, title: string) => Promise<void>;
    trackEvent: TrackEvent;
    getPlaybackAnalyticsProps: () => Record<string, unknown>;
    getMetadata: () => CastMetadata;
};

export function createPlayerCastController(deps: CreatePlayerCastControllerDeps) {
    const setDisconnectedState = () => {
        deps.setCastActive(false);
        deps.setCastDeviceName("");
        deps.setCastTransport(null);
    };

    const stopAndDisconnect = async () => {
        try {
            await stopCast();
        } catch {
            // ignore
        }
        try {
            await disconnectCast();
        } catch {
            // ignore
        }
        setDisconnectedState();
    };

    const connectOrDisconnect = async (mode: CastMode = "native", deviceId?: string) => {
        if (deps.isCastBusy()) {
            return;
        }
        const sessionId = deps.getSessionId();
        if (!sessionId) return;

        deps.setCastBusy(true);
        try {
            if (deps.isCastActive()) {
                await stopAndDisconnect();
                deps.trackEvent("cast_disconnected", deps.getPlaybackAnalyticsProps());
                await deps.showAlert("Casting disconnected.", "Cast");
                return;
            }

            deps.showDeviceScanLoading(mode);
            const cast = await createCastBootstrap(sessionId, 900);
            const absoluteCurrentTime = deps.getCurrentTime();
            const playbackOffset = Math.max(0, Number(deps.getPlaybackOffset() || 0));
            const streamRelativeStartTime = Math.max(0, absoluteCurrentTime - playbackOffset);

            const connection = await connectAndLoadCast({
                deviceId,
                streamUrl: cast.streamUrl,
                startTime: streamRelativeStartTime,
                mode,
                metadata: deps.getMetadata(),
            });

            deps.setCastActive(true);
            deps.setCastDeviceName(String(connection?.deviceName || (mode === "chrome" ? "Chromecast (Chrome)" : "Chromecast")));
            deps.setCastTransport((connection?.transport as CastMode | undefined) || mode);
            deps.setHasStarted(true);
            deps.pauseLocalVideo();
            deps.setIsPlaying(true);
            deps.hideDevicePicker();

            deps.trackEvent("cast_connected", {
                sessionId: cast.sessionId,
                localIp: cast.localIp,
                port: cast.port,
                deviceId: "google-cast-session",
                deviceName: String(connection?.deviceName || "Cast Receiver"),
                transport: (connection?.transport as CastMode | undefined) || mode,
                ...deps.getPlaybackAnalyticsProps(),
            });
            const message = mode === "chrome"
                ? "Casting launched in Chrome. Playback is running on your TV."
                : "Connected to Chromecast.";
            await deps.showAlert(message, "Cast Connected");
        } catch (error) {
            deps.hideDevicePicker();
            const details = error instanceof Error ? error.message : String(error);
            const normalized = details.toLowerCase();
            const isUserCancelled =
                normalized.includes("cast_picker_cancelled") ||
                normalized.includes("interactive_session_cancelled") ||
                normalized.includes("cast_picker_closed");

            if (isUserCancelled) {
                deps.trackEvent("cast_picker_cancelled", deps.getPlaybackAnalyticsProps());
                return;
            }

            deps.trackEvent("cast_bootstrap_failed", {
                reason: details,
                ...deps.getPlaybackAnalyticsProps(),
            });
            await deps.showAlert(details, "Cast Setup Failed");
        } finally {
            deps.setCastBusy(false);
        }
    };

    const seek = async (targetTime: number) => {
        if (deps.getCastTransport() !== "native") {
            return;
        }
        const playbackOffset = Math.max(0, Number(deps.getPlaybackOffset() || 0));
        const streamRelativeTarget = Math.max(0, Number(targetTime || 0) - playbackOffset);
        deps.setPendingSeek(targetTime);
        try {
            await seekCast(streamRelativeTarget);
            deps.setCurrentTime(targetTime);
        } finally {
            deps.setPendingSeek(null);
        }
    };

    const togglePlay = async (isCurrentlyPlaying: boolean) => {
        if (deps.getCastTransport() !== "native") {
            return;
        }
        if (isCurrentlyPlaying) {
            await pauseCast();
            deps.setIsPlaying(false);
            return;
        }
        await playCast();
        deps.setIsPlaying(true);
    };

    const setVolume = async (nextVolume: number) => {
        if (deps.getCastTransport() !== "native") {
            return;
        }
        const clamped = Math.max(0, Math.min(1, nextVolume));
        deps.setVolumeLevel(clamped);
        await setCastVolume(clamped);
    };

    const cleanup = async () => {
        await stopAndDisconnect();
    };

    return {
        connectOrDisconnect,
        seek,
        togglePlay,
        setVolume,
        cleanup,
        stopAndDisconnect,
    };
}
