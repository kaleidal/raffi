import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bgthifmjlsgciechwvpm.supabase.co";
const SUPABASE_ANON_KEY =
    "sb_publishable_UZf0VuUiFWFDaJWHkHYkew_ux9PxOM2";

const legacySupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
});

const LOCAL_ADDONS_KEY = "local:addons";
const LOCAL_LIBRARY_KEY = "local:library";
const LOCAL_LISTS_KEY = "local:lists";
const LOCAL_LIST_ITEMS_KEY = "local:list_items";
const LEGACY_SUPABASE_SESSION_KEY = "raffi_auth_token";

type LegacySession = {
    access_token?: string;
    refresh_token?: string;
};

const writeLocal = (key: string, value: any) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
};

const readLegacySession = (): LegacySession | null => {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(LEGACY_SUPABASE_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed) return null;

        if (parsed.currentSession?.access_token && parsed.currentSession?.refresh_token) {
            return {
                access_token: parsed.currentSession.access_token,
                refresh_token: parsed.currentSession.refresh_token,
            };
        }
        if (parsed.access_token && parsed.refresh_token) {
            return {
                access_token: parsed.access_token,
                refresh_token: parsed.refresh_token,
            };
        }
        return null;
    } catch {
        return null;
    }
};

export const hasLegacySupabaseSession = () => {
    const session = readLegacySession();
    return Boolean(session?.access_token && session?.refresh_token);
};

export const clearLegacySupabaseSession = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(LEGACY_SUPABASE_SESSION_KEY);
};

const fetchUserStateToLocal = async (userId: string) => {
    const [addonsRes, libraryRes, listsRes] = await Promise.all([
        legacySupabase.from("addons").select("*").eq("user_id", userId),
        legacySupabase.from("libraries").select("*").eq("user_id", userId),
        legacySupabase.from("lists").select("*").eq("user_id", userId),
    ]);

    if (addonsRes.error) throw addonsRes.error;
    if (libraryRes.error) throw libraryRes.error;
    if (listsRes.error) throw listsRes.error;

    const listIds = (listsRes.data || []).map((list) => list.list_id);
    let listItems: any[] = [];

    if (listIds.length > 0) {
        const listItemsRes = await legacySupabase
            .from("list_items")
            .select("*")
            .in("list_id", listIds);
        if (listItemsRes.error) throw listItemsRes.error;
        listItems = listItemsRes.data || [];
    }

    writeLocal(LOCAL_ADDONS_KEY, addonsRes.data || []);
    writeLocal(LOCAL_LIBRARY_KEY, libraryRes.data || []);
    writeLocal(LOCAL_LISTS_KEY, listsRes.data || []);
    writeLocal(LOCAL_LIST_ITEMS_KEY, listItems);

    return {
        addons: (addonsRes.data || []).length,
        library: (libraryRes.data || []).length,
        lists: (listsRes.data || []).length,
        listItems: listItems.length,
    };
};

export const importLegacySupabaseDataToLocal = async (email: string, password: string) => {
    const { data: authData, error: authError } = await legacySupabase.auth.signInWithPassword({
        email,
        password,
    });
    if (authError) throw authError;

    const userId = authData.user?.id;
    if (!userId) {
        await legacySupabase.auth.signOut();
        throw new Error("Supabase login did not return a user id");
    }

    const result = await fetchUserStateToLocal(userId);

    await legacySupabase.auth.signOut();

    return result;
};

export const importLegacySupabaseSessionToLocal = async () => {
    const session = readLegacySession();
    if (!session?.access_token || !session?.refresh_token) {
        throw new Error("No legacy Supabase session found");
    }

    const { error: setSessionError } = await legacySupabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
    });
    if (setSessionError) {
        throw setSessionError;
    }

    const { data: userData, error: userError } = await legacySupabase.auth.getUser();
    if (userError) throw userError;
    const userId = userData.user?.id;
    if (!userId) {
        throw new Error("Legacy Supabase session did not provide a user");
    }

    const result = await fetchUserStateToLocal(userId);
    await legacySupabase.auth.signOut();
    clearLegacySupabaseSession();
    return result;
};
