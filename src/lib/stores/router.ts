import { writable } from "svelte/store";

export type Route = "home" | "login" | "meta" | "player";

export interface RouterState {
    page: Route;
    params: Record<string, any>;
}

function createRouter() {
    const { subscribe, set, update } = writable<RouterState>({
        page: "home",
        params: {},
    });

    return {
        subscribe,
        navigate: (page: Route, params: Record<string, any> = {}) => {
            set({ page, params });
        },
    };
}

export const router = createRouter();
