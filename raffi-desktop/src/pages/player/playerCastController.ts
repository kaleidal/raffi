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
};

type CreatePlayerCastControllerDeps = {
    getSessionId: () => string;
    isCastActive: () => boolean;
    isCastBusy: () => boolean;
    setCastBusy: (busy: boolean) => void;
    setCastActive: (active: boolean) => void;
    setCastDeviceName: (name: string) => void;
    getCurrentTime: () => number;
    setCurrentTime: (time: number) => void;
    setVolumeLevel: (level: number) => void;
    setIsPlaying: (playing: boolean) => void;
    setPendingSeek: (time: number | null) => void;
    pauseLocalVideo: () => void;
    showDeviceScanLoading: () => void;
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

    const connectOrDisconnect = async () => {
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

            deps.showDeviceScanLoading();
            const cast = await createCastBootstrap(sessionId, 900);

            await connectAndLoadCast({
                streamUrl: cast.streamUrl,
                startTime: deps.getCurrentTime(),
                metadata: deps.getMetadata(),
            });

            deps.setCastActive(true);
            deps.setCastDeviceName("Chromecast");
            deps.pauseLocalVideo();
            deps.setIsPlaying(true);
            deps.hideDevicePicker();

            deps.trackEvent("cast_connected", {
                sessionId: cast.sessionId,
                localIp: cast.localIp,
                port: cast.port,
                deviceId: "google-cast-session",
                deviceName: "Cast Receiver",
                ...deps.getPlaybackAnalyticsProps(),
            });
            await deps.showAlert("Connected to Chromecast.", "Cast Connected");
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
        deps.setPendingSeek(targetTime);
        try {
            await seekCast(targetTime);
            deps.setCurrentTime(targetTime);
        } finally {
            deps.setPendingSeek(null);
        }
    };

    const togglePlay = async (isCurrentlyPlaying: boolean) => {
        if (isCurrentlyPlaying) {
            await pauseCast();
            deps.setIsPlaying(false);
            return;
        }
        await playCast();
        deps.setIsPlaying(true);
    };

    const setVolume = async (nextVolume: number) => {
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
