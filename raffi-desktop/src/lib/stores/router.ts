import { writable } from "svelte/store";

export type Route = "home" | "login" | "meta" | "player" | "lists";

export interface RouterState {
    page: Route;
    params: Record<string, any>;
}

const MAX_HISTORY = 50;

function shallowEqual(a: Record<string, any>, b: Record<string, any>) {
    const aKeys = Object.keys(a || {});
    const bKeys = Object.keys(b || {});
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => a[key] === b[key]);
}

function createRouter() {
    const initialState: RouterState = { page: "home", params: {} };
    const store = writable<RouterState>(initialState);
    const { subscribe, set } = store;

    let currentState = initialState;
    const history: RouterState[] = [];

    subscribe((value) => {
        currentState = value;
    });

    function pushHistory(state: RouterState) {
        history.push({ page: state.page, params: { ...state.params } });
        if (history.length > MAX_HISTORY) {
            history.shift();
        }
    }

    return {
        subscribe,
        navigate: (
            page: Route,
            params: Record<string, any> = {},
            options: { replace?: boolean } = {},
        ) => {
            const nextState: RouterState = { page, params };
            const isSamePage =
                currentState.page === nextState.page &&
                shallowEqual(currentState.params, nextState.params);

            if (!options.replace && !isSamePage) {
                pushHistory(currentState);
            }

            if (!isSamePage || options.replace) {
                set(nextState);
            }
        },
        back: () => {
            const previous = history.pop();
            if (previous) {
                set(previous);
                return true;
            }
            return false;
        },
        canGoBack: () => history.length > 0,
        reset: () => {
            history.length = 0;
            set(initialState);
        },
    };
}

export const router = createRouter();
