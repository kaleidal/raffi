export type ImportPhase =
    | "idle"
    | "fetching"
    | "preview"
    | "parsing"
    | "importing_addons"
    | "applying"
    | "reconciling"
    | "uploading"
    | "done"
    | "error";

export type ImportProgress = { processed: number; total: number; current?: string };

export type ImportResultSummary = {
    total: number;
    rawCount: number;
    added: number;
    merged: number;
    skipped: number;
    movies: number;
    series: number;
    watched: number;
    addonsAdded: number;
    addonsSkipped: number;
};

export const importStatusLabel = (
    phase: ImportPhase,
    rawEntryCount: number | null,
    progress: ImportProgress,
) => {
    if (phase === "fetching") return "Signing in to Stremio…";
    if (phase === "preview") return "Choose what to import";
    if (phase === "parsing") {
        if (rawEntryCount && rawEntryCount > 0) {
            return `Reading ${rawEntryCount} ${rawEntryCount === 1 ? "entry" : "entries"}…`;
        }
        return "Reading your library…";
    }
    if (phase === "applying") return `Importing… ${progress.processed}/${progress.total}`;
    if (phase === "importing_addons") return "Importing your addons…";
    if (phase === "reconciling" || phase === "uploading") return "Almost done…";
    if (phase === "done") return "Import complete";
    if (phase === "error") return "Could not import";
    return "Sign in with your Stremio account";
};

export const importStatusHint = (phase: ImportPhase, progress: ImportProgress) => {
    if (phase === "fetching") return "Connecting to Stremio and loading your library and addons.";
    if (phase === "preview") return "Uncheck anything you do not want in Raffi.";
    if (phase === "parsing") return "Converting each title and its watch progress.";
    if (phase === "importing_addons") return "Installing compatible Stremio addons into Raffi.";
    if (phase === "applying") return progress.current ? `Adding ${progress.current}` : "Adding entries to your library.";
    if (phase === "reconciling") return "Checking your other devices.";
    if (phase === "uploading") return "Backing up the merged library.";
    if (phase === "done") return "Your library is up to date.";
    return "We only use your credentials to read your library and addons. Your password is never stored.";
};
