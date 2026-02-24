export type CastBootstrap = {
    sessionId: string;
    localIp: string;
    port: number;
    token: string;
    expiresAt: string;
    streamUrl: string;
    sessionUrl: string;
};

export type CastDevice = {
    id: string;
    name: string;
    host: string;
};

export type CastStatus = {
    active: boolean;
    deviceId?: string;
    deviceName?: string;
    transport?: "native" | "chrome";
    mediaUrl?: string;
    playerState?: string;
    currentTime?: number;
    volumeLevel?: number;
    raw?: unknown;
};

type CastMetadata = {
    title?: string;
    subtitle?: string;
    cover?: string;
    background?: string;
    durationSeconds?: number;
};

type CastConnectPayload = {
    deviceId?: string;
    streamUrl: string;
    startTime?: number;
    mode?: "native" | "chrome";
    metadata?: CastMetadata;
};

export async function createCastBootstrap(sessionId: string, ttlSeconds = 900): Promise<CastBootstrap> {
    if (typeof window === "undefined") {
        throw new Error("Cast bootstrap is only available in desktop runtime");
    }

    const electronApi = (window as any).electronAPI;
    if (!electronApi?.cast?.createBootstrap) {
        throw new Error("Cast bootstrap API unavailable");
    }

    return electronApi.cast.createBootstrap(sessionId, ttlSeconds) as Promise<CastBootstrap>;
}

function getCastApi() {
    const electronApi = (window as any).electronAPI;
    if (!electronApi?.cast) {
        throw new Error("Cast API unavailable");
    }
    return electronApi.cast;
}

export async function listCastDevices(timeoutMs = 3000): Promise<CastDevice[]> {
    if (typeof window === "undefined") return [];
    const api = getCastApi();
    if (!api.listDevices) {
        throw new Error("Cast listDevices API unavailable");
    }
    return api.listDevices(timeoutMs) as Promise<CastDevice[]>;
}

export async function connectAndLoadCast(payload: CastConnectPayload): Promise<{
    active: boolean;
    deviceId: string;
    mediaUrl: string;
    deviceName?: string;
    transport?: "native" | "chrome";
}> {
    const api = getCastApi();
    if (!api.connectAndLoad) {
        throw new Error("Cast connect API unavailable");
    }
    return api.connectAndLoad(payload) as Promise<{
        active: boolean;
        deviceId: string;
        mediaUrl: string;
        deviceName?: string;
        transport?: "native" | "chrome";
    }>;
}

export async function playCast(): Promise<void> {
    const api = getCastApi();
    if (!api.play) throw new Error("Cast play API unavailable");
    await api.play();
}

export async function pauseCast(): Promise<void> {
    const api = getCastApi();
    if (!api.pause) throw new Error("Cast pause API unavailable");
    await api.pause();
}

export async function seekCast(currentTime: number): Promise<void> {
    const api = getCastApi();
    if (!api.seek) throw new Error("Cast seek API unavailable");
    await api.seek(currentTime);
}

export async function setCastVolume(level: number): Promise<void> {
    const api = getCastApi();
    if (!api.setVolume) throw new Error("Cast volume API unavailable");
    await api.setVolume(level);
}

export async function stopCast(): Promise<void> {
    const api = getCastApi();
    if (!api.stop) throw new Error("Cast stop API unavailable");
    await api.stop();
}

export async function disconnectCast(): Promise<void> {
    const api = getCastApi();
    if (!api.disconnect) throw new Error("Cast disconnect API unavailable");
    await api.disconnect();
}

export async function getCastStatus(): Promise<CastStatus> {
    const api = getCastApi();
    if (!api.status) throw new Error("Cast status API unavailable");
    return api.status() as Promise<CastStatus>;
}
