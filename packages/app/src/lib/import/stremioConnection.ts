import { readLocal, removeLocal, writeLocal } from "../db/state";

const LOCAL_STREMIO_CONNECTION_KEY = "local:stremio_connection";

export interface StremioConnection {
    authKey: string;
    email: string;
    connectedAt: string;
}

export const getStremioConnection = (): StremioConnection | null => {
    const stored = readLocal<StremioConnection | null>(LOCAL_STREMIO_CONNECTION_KEY, null);
    if (!stored?.authKey || !stored.email) return null;
    return stored;
};

export const saveStremioConnection = (connection: Omit<StremioConnection, "connectedAt">) => {
    writeLocal(LOCAL_STREMIO_CONNECTION_KEY, {
        ...connection,
        connectedAt: new Date().toISOString(),
    } satisfies StremioConnection);
};

export const clearStremioConnection = () => {
    removeLocal(LOCAL_STREMIO_CONNECTION_KEY);
};

export type StremioConnectionStatus = {
    connected: boolean;
    email: string | null;
    connectedAt: string | null;
};

export const getStremioConnectionStatus = (): StremioConnectionStatus => {
    const connection = getStremioConnection();
    if (!connection) {
        return { connected: false, email: null, connectedAt: null };
    }
    return {
        connected: true,
        email: connection.email,
        connectedAt: connection.connectedAt,
    };
};
