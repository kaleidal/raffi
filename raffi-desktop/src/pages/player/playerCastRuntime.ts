import { getCastStatus, listCastDevices, reloadCastMedia, type CastDevice } from "../../lib/cast";

export type { CastDevice };

export type CastMode = "native" | "chrome";
export type CastModalStep = "mode" | "native-devices";

type CreatePlayerCastRuntimeDeps = {
    getSessionId: () => string;
    getServerUrl: () => string;
    isCastActive: () => boolean;
    setCastActive: (active: boolean) => void;
    getCastTransport: () => CastMode | null;
    setCastTransport: (mode: CastMode | null) => void;
    setCastDeviceName: (name: string) => void;
    setCastModalOpen: (open: boolean) => void;
    setCastModalLoading: (loading: boolean) => void;
    setCastModalMode: (mode: CastMode) => void;
    setCastModalStep: (step: CastModalStep) => void;
    setNativeCastDevices: (devices: CastDevice[]) => void;
    setHasStarted: (started: boolean) => void;
    getPlaybackOffset: () => number;
    setCurrentTime: (time: number) => void;
    handleProgress: (time: number, duration: number) => void;
    getDuration: () => number;
    setDuration: (duration: number) => void;
    setIsPlaying: (playing: boolean) => void;
    showAlert: (message: string, title: string) => Promise<void>;
};

export function createPlayerCastRuntime(deps: CreatePlayerCastRuntimeDeps) {
    let castStatusInterval: ReturnType<typeof setInterval> | null = null;
    let castDurationBackfillAttempts = 0;
    const maxCastDurationBackfillAttempts = 20;
    let castDurationReloaded = false;

    const showDeviceScanLoading = (mode: CastMode) => {
        deps.setCastModalOpen(true);
        deps.setCastModalLoading(true);
        deps.setCastModalMode(mode);
    };

    const showDeviceModePicker = () => {
        deps.setCastModalOpen(true);
        deps.setCastModalLoading(false);
        deps.setCastModalMode("native");
        deps.setCastModalStep("mode");
        deps.setNativeCastDevices([]);
    };

    const hideDevicePicker = () => {
        deps.setCastModalOpen(false);
        deps.setCastModalLoading(false);
        deps.setCastModalStep("mode");
        deps.setNativeCastDevices([]);
    };

    const openNativeDeviceSelection = async () => {
        deps.setCastModalStep("native-devices");
        deps.setCastModalMode("native");
        deps.setCastModalLoading(true);
        deps.setNativeCastDevices([]);
        try {
            const devices = await listCastDevices(5000);
            deps.setNativeCastDevices(devices);
            if (devices.length === 0) {
                await deps.showAlert(
                    "No Chromecast devices found. Make sure your TV and computer are on the same LAN.",
                    "No Cast Devices",
                );
            }
        } catch (error) {
            await deps.showAlert(
                error instanceof Error ? error.message : String(error),
                "Native Cast Discovery Failed",
            );
        } finally {
            deps.setCastModalLoading(false);
        }
    };

    const tryBackfillDuration = async () => {
        const sessionId = deps.getSessionId();
        if (!sessionId) {
            return;
        }
        try {
            const res = await fetch(`${deps.getServerUrl()}/sessions/${sessionId}`);
            if (!res.ok) {
                return;
            }
            const data = await res.json();
            const nextDuration = Number(data?.durationSeconds || 0);
            if (Number.isFinite(nextDuration) && nextDuration > 0) {
                deps.setDuration(nextDuration);
                castDurationBackfillAttempts = maxCastDurationBackfillAttempts;
                if (!castDurationReloaded) {
                    castDurationReloaded = true;
                    void reloadCastMedia(nextDuration).catch(() => {});
                }
            }
        } catch {
        }
    };

    const pollStatus = async () => {
        if (!deps.isCastActive()) {
            return;
        }
        try {
            const status = await getCastStatus();
            if (!status?.active) {
                deps.setCastActive(false);
                deps.setCastTransport(null);
                deps.setCastDeviceName("");
                return;
            }

            if (status.deviceName) {
                deps.setCastDeviceName(status.deviceName);
            }
            if (status.transport) {
                deps.setCastTransport(status.transport);
            }

            const currentTransport = deps.getCastTransport();
            if (currentTransport === "native" || currentTransport === "chrome") {
                const castTime = Number(status.currentTime || 0);
                const playbackOffsetSeconds = Math.max(0, Number(deps.getPlaybackOffset() || 0));
                if (Number.isFinite(castTime) && castTime >= 0) {
                    const absoluteCastTime = castTime + playbackOffsetSeconds;
                    deps.setHasStarted(true);
                    deps.setCurrentTime(absoluteCastTime);
                    deps.handleProgress(absoluteCastTime, deps.getDuration());
                }

                const playerState = String(status.playerState || "").toUpperCase();
                if (playerState.includes("PAUSE") || playerState.includes("IDLE")) {
                    deps.setIsPlaying(false);
                } else if (playerState.length > 0) {
                    deps.setIsPlaying(true);
                }

                if (status.duration != null) {
                    const castDuration = Number(status.duration);
                    if (Number.isFinite(castDuration) && castDuration > 0 && deps.getDuration() <= 0) {
                        deps.setDuration(castDuration);
                        castDurationBackfillAttempts = maxCastDurationBackfillAttempts;
                        castDurationReloaded = true;
                    }
                }
            }

            if (deps.getDuration() <= 0 && castDurationBackfillAttempts < maxCastDurationBackfillAttempts) {
                castDurationBackfillAttempts += 1;
                void tryBackfillDuration();
            } else if (deps.getDuration() > 0 && !castDurationReloaded) {
                castDurationReloaded = true;
                void reloadCastMedia(deps.getDuration()).catch(() => {});
            }
        } catch {
        }
    };

    const startStatusPolling = () => {
        if (castStatusInterval) {
            return;
        }
        castDurationBackfillAttempts = 0;
        castDurationReloaded = false;
        void pollStatus();
        castStatusInterval = setInterval(() => {
            void pollStatus();
        }, 1000);
    };

    const stopStatusPolling = () => {
        if (!castStatusInterval) {
            return;
        }
        clearInterval(castStatusInterval);
        castStatusInterval = null;
    };

    const cleanup = () => {
        stopStatusPolling();
    };

    return {
        showDeviceScanLoading,
        showDeviceModePicker,
        hideDevicePicker,
        openNativeDeviceSelection,
        startStatusPolling,
        stopStatusPolling,
        cleanup,
    };
}