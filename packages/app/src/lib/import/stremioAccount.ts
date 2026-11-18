import { getAddons } from "../db/data";
import { parseStremioLibrary } from "./stremioLibrary/parse";
import type { StremioImportSummary } from "./stremioLibrary/types";
import {
    fetchStremioAccountData,
    fetchStremioLibraryWithLogin,
    logoutStremio,
    StremioApiClientError,
} from "./stremioApi";
import {
    clearStremioConnection,
    getStremioConnection,
    getStremioConnectionStatus,
    saveStremioConnection,
    type StremioConnectionStatus,
} from "./stremioConnection";
import {
    buildStremioAddonPreviewItems,
    type StremioImportPreview,
} from "./stremioImportPreview";
import {
    importStremioLibrary,
    type StremioImportOptions,
    type StremioImportProgressEvent,
} from "./stremioImport";

export interface StremioImportSelection {
    libraryIds: string[];
    addonIds: string[];
}

export const getStremioStatus = (): StremioConnectionStatus => getStremioConnectionStatus();

export const disconnectStremio = async () => {
    const connection = getStremioConnection();
    if (connection?.authKey) {
        await logoutStremio(connection.authKey);
    }
    clearStremioConnection();
};

export const previewStremioImportFromAccount = async (
    email: string,
    password: string,
): Promise<StremioImportPreview> => {
    try {
        const { authKey, email: resolvedEmail, library, addons } =
            await fetchStremioLibraryWithLogin(email, password);
        const parsed = parseStremioLibrary(library);
        const existingAddons = await getAddons();

        return {
            authKey,
            email: resolvedEmail,
            libraryItems: parsed.items,
            addons: buildStremioAddonPreviewItems(addons, existingAddons),
            warnings: parsed.warnings,
            rawCount: parsed.rawCount,
        };
    } catch (error) {
        if (error instanceof StremioApiClientError) {
            if (error.apiError?.wrongPass) {
                throw new Error("Wrong email or password.");
            }
            throw new Error(error.message);
        }
        throw error;
    }
};

export const importStremioFromPreview = async (
    preview: StremioImportPreview,
    selection: StremioImportSelection,
    options: StremioImportOptions & { keepConnected?: boolean } = {},
): Promise<StremioImportSummary> => {
    const { keepConnected = false, ...importOptions } = options;
    const libraryIdSet = new Set(selection.libraryIds);
    const addonIdSet = new Set(selection.addonIds);

    const selectedLibrary = preview.libraryItems.filter((item) =>
        libraryIdSet.has(item.imdbId),
    );
    const selectedAddons = preview.addons
        .filter((item) => addonIdSet.has(item.id))
        .map((item) => item.descriptor);

    if (keepConnected) {
        saveStremioConnection({ authKey: preview.authKey, email: preview.email });
    }

    return await importStremioLibrary([], {
        ...importOptions,
        libraryPreviews: selectedLibrary,
        addons: selectedAddons,
        initialWarnings: preview.warnings,
    });
};

export const syncStremioLibrary = async (
    options: StremioImportOptions = {},
): Promise<StremioImportSummary> => {
    const connection = getStremioConnection();
    if (!connection) {
        throw new Error("Stremio is not connected. Sign in from Import from Stremio first.");
    }

    const onProgress = options.onProgress;
    const report = (event: StremioImportProgressEvent) => {
        if (onProgress) onProgress(event);
    };

    report({ phase: "fetching" });
    try {
        const { library, addons } = await fetchStremioAccountData(connection.authKey);
        if (options.signal?.aborted) {
            throw new Error("Import was cancelled.");
        }
        return await importStremioLibrary(library, {
            ...options,
            addons,
        });
    } catch (error) {
        if (error instanceof StremioApiClientError) {
            clearStremioConnection();
            throw new Error("Stremio session expired. Sign in again to keep syncing.");
        }
        throw error;
    }
};

