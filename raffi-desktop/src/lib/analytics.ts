import posthog from "posthog-js";
import type { AppUser } from "./auth/types";
import type { Route } from "./stores/router";

export type AnalyticsSettings = {
    enabled: boolean;
    sessionReplay: boolean;
};

const ANALYTICS_ENABLED_KEY = "analytics_enabled";
const ANALYTICS_REPLAY_KEY = "analytics_session_replay_enabled";
const DEFAULT_HOST = "https://eu.i.posthog.com";
const DEFAULT_API_KEY = "phc_KfZzLVnffYNKrVo9iyWmAgrN7cY2wE9GVmeTIAl9SIy";

let initialized = false;
let lastPage: Route | null = null;
let lastUserId: string | null = null;

const isBrowser = () => typeof window !== "undefined";

const readStoredBool = (key: string, fallback: boolean) => {
    if (!isBrowser()) return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return raw === "true";
    } catch {
        return fallback;
    }
};

export const isAnalyticsAvailable = () => {
    if (!isBrowser()) return false;
    return Boolean(import.meta.env.VITE_POSTHOG_KEY || DEFAULT_API_KEY);
};

export const getAnalyticsSettings = (): AnalyticsSettings => ({
    enabled: readStoredBool(ANALYTICS_ENABLED_KEY, true),
    sessionReplay: readStoredBool(ANALYTICS_REPLAY_KEY, false),
});

const persistSettings = (settings: AnalyticsSettings) => {
    if (!isBrowser()) return;
    try {
        localStorage.setItem(ANALYTICS_ENABLED_KEY, String(settings.enabled));
        localStorage.setItem(ANALYTICS_REPLAY_KEY, String(settings.sessionReplay));
    } catch {
        // ignore storage errors
    }
};

const applyConsent = (settings: AnalyticsSettings) => {
    if (!initialized) return;

    if (settings.enabled) {
        posthog.opt_in_capturing();
        if (settings.sessionReplay) {
            posthog.startSessionRecording();
        } else {
            posthog.stopSessionRecording();
        }

        if (lastUserId) {
            posthog.identify(lastUserId);
        }
        return;
    }

    posthog.stopSessionRecording();
    posthog.opt_out_capturing();
};

export const setAnalyticsSettings = (settings: AnalyticsSettings) => {
    persistSettings(settings);
    applyConsent(settings);
};

const canCapture = () => initialized && !posthog.has_opted_out_capturing();

export const initAnalytics = () => {
    if (initialized || !isBrowser()) return;

    const apiKey = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ?? DEFAULT_API_KEY;
    if (!apiKey) return;

    const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? DEFAULT_HOST;

    posthog.init(apiKey, {
        api_host: host,
        autocapture: false,
        capture_exceptions: true,
        capture_pageview: false,
        capture_pageleave: false,
        opt_out_capturing_by_default: false,
        disable_session_recording: true,
        session_recording: {
            maskAllInputs: true,
        },
        persistence: "localStorage",
        defaults: '2025-11-30'
    });

    initialized = true;

    posthog.register({
        app: "raffi",
        platform: (window as any)?.electronAPI ? "electron" : "web",
        environment: import.meta.env.MODE,
    });

    applyConsent(getAnalyticsSettings());
};

export const trackEvent = (event: string, properties?: Record<string, any>) => {
    if (!canCapture()) return;
    posthog.capture(event, properties);
};

export const trackPageView = (page: Route) => {
    if (!canCapture()) return;
    if (page === lastPage) return;
    lastPage = page;
    posthog.capture("page_view", { page });
};

export const setAnalyticsUser = (user: AppUser | null) => {
    lastUserId = user?.id ?? null;
    if (!canCapture()) return;

    if (lastUserId) {
        posthog.identify(lastUserId);
    } else {
        posthog.reset();
    }
};
