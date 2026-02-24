import { actionGeneric, mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

const getNowIso = () => new Date().toISOString();

const collectByUser = async (db: any, table: string, userId: string) => {
    return db.query(table).withIndex("by_user", (q: any) => q.eq("user_id", userId)).collect();
};

const uniqueBy = <T extends Record<string, any>>(items: T[], keyFn: (item: T) => string) => {
    const map = new Map<string, T>();
    for (const item of items) {
        map.set(keyFn(item), item);
    }
    return Array.from(map.values());
};

const optionalString = (value: any) => {
    if (typeof value === "string" && value.length > 0) return value;
    return undefined;
};

const importedAddonValidator = v.object({
    transport_url: v.string(),
    manifest: v.any(),
    flags: v.optional(v.any()),
    addon_id: v.optional(v.string()),
    added_at: v.optional(v.string()),
});

const importedLibraryValidator = v.object({
    imdb_id: v.string(),
    progress: v.any(),
    last_watched: v.optional(v.string()),
    completed_at: v.optional(v.union(v.string(), v.null())),
    type: v.optional(v.string()),
    shown: v.optional(v.boolean()),
    poster: v.optional(v.string()),
});

const importedListValidator = v.object({
    list_id: v.string(),
    name: v.string(),
    position: v.optional(v.number()),
    created_at: v.optional(v.string()),
});

const importedListItemValidator = v.object({
    list_id: v.string(),
    imdb_id: v.string(),
    position: v.optional(v.number()),
    type: v.optional(v.string()),
    poster: v.optional(v.string()),
});

const MAX_IMPORT_COUNTS = {
    addons: 500,
    library: 10_000,
    lists: 1_000,
    listItems: 20_000,
} as const;

const assertImportCount = (label: keyof typeof MAX_IMPORT_COUNTS, count: number) => {
    const max = MAX_IMPORT_COUNTS[label];
    if (count > max) {
        throw new Error(`Import payload for ${label} is too large (${count}/${max})`);
    }
};

const requireAuthedUserId = async (ctx: any) => {
    const identity = await ctx.auth.getUserIdentity();
    const authedUserId = identity?.subject;
    if (!authedUserId) {
        throw new Error("Not authenticated");
    }
    return authedUserId;
};

const TRAKT_API_BASE_URL = "https://api.trakt.tv";
const TRAKT_AUTHORIZE_URL = "https://trakt.tv/oauth/authorize";
const DEFAULT_TRAKT_REDIRECT_URI = "raffi://trakt/callback";

const getEnv = (key: string): string | undefined => {
    const value = (globalThis as any)?.process?.env?.[key];
    return optionalString(value);
};

const getTraktConfig = () => {
    const clientId = getEnv("TRAKT_CLIENT_ID");
    const clientSecret = getEnv("TRAKT_CLIENT_SECRET");
    const redirectUri = getEnv("TRAKT_REDIRECT_URI") || DEFAULT_TRAKT_REDIRECT_URI;
    return {
        clientId,
        clientSecret,
        redirectUri,
        configured: Boolean(clientId && clientSecret),
    };
};

const parseJsonSafe = async (response: Response) => {
    try {
        return await response.json();
    } catch {
        return null;
    }
};

const buildTraktHeaders = (clientId: string, accessToken?: string) => {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": clientId,
    };
    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    return headers;
};

const getTraktErrorMessage = (status: number, payload: any) => {
    const msg =
        optionalString(payload?.error_description) ||
        optionalString(payload?.error) ||
        optionalString(payload?.message);
    return msg || `Trakt request failed (${status})`;
};

const exchangeOrRefreshTraktToken = async (
    body: Record<string, any>,
    config: { clientId: string; clientSecret: string },
) => {
    const response = await fetch(`${TRAKT_API_BASE_URL}/oauth/token`, {
        method: "POST",
        headers: buildTraktHeaders(config.clientId),
        body: JSON.stringify({
            ...body,
            client_id: config.clientId,
            client_secret: config.clientSecret,
        }),
    });
    const payload = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(getTraktErrorMessage(response.status, payload));
    }
    return payload || {};
};

const fetchTraktSettings = async (clientId: string, accessToken: string) => {
    const response = await fetch(`${TRAKT_API_BASE_URL}/users/settings`, {
        method: "GET",
        headers: buildTraktHeaders(clientId, accessToken),
    });
    const payload = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(getTraktErrorMessage(response.status, payload));
    }
    return payload;
};

const toExpiresAtMs = (payload: any): number | undefined => {
    const createdAt = Number(payload?.created_at);
    const expiresIn = Number(payload?.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) return undefined;
    const created = Number.isFinite(createdAt) && createdAt > 0
        ? createdAt
        : Math.floor(Date.now() / 1000);
    return Math.round((created + expiresIn) * 1000);
};

const getProfileValues = (settingsPayload: any) => {
    const user = settingsPayload?.user || {};
    return {
        username: optionalString(user?.username),
        slug: optionalString(user?.ids?.slug) || optionalString(user?.slug),
    };
};

const getTraktIntegrationForUser = async (ctx: any, userId: string) => {
    return ctx.runQuery((internal as any).raffi.getTraktIntegrationInternal, { userId });
};

const saveTraktIntegrationForUser = async (
    ctx: any,
    args: {
        userId: string;
        accessToken: string;
        refreshToken: string;
        scope?: string;
        tokenType?: string;
        expiresAt?: number;
        username?: string;
        slug?: string;
    },
) => {
    return ctx.runMutation((internal as any).raffi.upsertTraktIntegrationInternal, args);
};

export const getState = queryGeneric({
    args: { },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const [addons, library, lists] = await Promise.all([
            collectByUser(ctx.db, "addons", userId),
            collectByUser(ctx.db, "libraries", userId),
            collectByUser(ctx.db, "lists", userId),
        ]);

        const listIds = lists.map((list: any) => list.list_id);
        let listItems: any[] = [];
        if (listIds.length > 0) {
            const rows = await Promise.all(
                listIds.map((listId: string) =>
                    ctx.db.query("list_items").withIndex("by_list", (q: any) => q.eq("list_id", listId)).collect(),
                ),
            );
            listItems = rows.flat();
        }

        return {
            addons,
            library,
            lists,
            listItems,
        };
    },
});

export const ensureDefaultAddon = mutationGeneric({
    args: {
        addon: v.object({
            transportUrl: v.string(),
            manifest: v.any(),
        }),
    },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("addons")
            .withIndex("by_user_transport", (q: any) =>
                q.eq("user_id", userId).eq("transport_url", args.addon.transportUrl),
            )
            .unique();
        if (existing) return existing._id;
        return ctx.db.insert("addons", {
            user_id: userId,
            added_at: getNowIso(),
            transport_url: args.addon.transportUrl,
            manifest: args.addon.manifest,
            flags: { protected: false, official: false },
            addon_id: crypto.randomUUID(),
        });
    },
});

export const importState = mutationGeneric({
    args: {
        addons: v.array(importedAddonValidator),
        library: v.array(importedLibraryValidator),
        lists: v.array(importedListValidator),
        listItems: v.array(importedListItemValidator),
    },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const addons = uniqueBy(args.addons || [], (item) => item.transport_url || "");
        assertImportCount("addons", addons.length);
        for (const addon of addons) {
            const existing = await ctx.db
                .query("addons")
                .withIndex("by_user_transport", (q: any) =>
                    q.eq("user_id", userId).eq("transport_url", addon.transport_url),
                )
                .unique();
            if (existing) {
                await ctx.db.patch(existing._id, {
                    manifest: addon.manifest,
                    flags: addon.flags,
                    added_at: addon.added_at || getNowIso(),
                    addon_id: addon.addon_id || existing.addon_id,
                });
            } else {
                await ctx.db.insert("addons", {
                    user_id: userId,
                    added_at: addon.added_at || getNowIso(),
                    transport_url: addon.transport_url,
                    manifest: addon.manifest,
                    flags: addon.flags,
                    addon_id: addon.addon_id || crypto.randomUUID(),
                });
            }
        }

        const library = uniqueBy(args.library || [], (item) => item.imdb_id || "");
        assertImportCount("library", library.length);
        for (const row of library) {
            const existing = await ctx.db
                .query("libraries")
                .withIndex("by_user_imdb", (q: any) => q.eq("user_id", userId).eq("imdb_id", row.imdb_id))
                .unique();
            if (existing) {
                await ctx.db.patch(existing._id, {
                    progress: row.progress,
                    last_watched: row.last_watched || getNowIso(),
                    completed_at: row.completed_at ?? null,
                    type: row.type || "movie",
                    shown: row.shown !== false,
                    poster: optionalString(row.poster),
                });
            } else {
                await ctx.db.insert("libraries", {
                    user_id: userId,
                    imdb_id: row.imdb_id,
                    progress: row.progress,
                    last_watched: row.last_watched || getNowIso(),
                    completed_at: row.completed_at ?? null,
                    type: row.type || "movie",
                    shown: row.shown !== false,
                    poster: optionalString(row.poster),
                });
            }
        }

        const lists = uniqueBy(args.lists || [], (item) => item.list_id || "");
        assertImportCount("lists", lists.length);
        for (const list of lists) {
            const existing = await ctx.db
                .query("lists")
                .withIndex("by_list_id", (q: any) => q.eq("list_id", list.list_id))
                .unique();
            if (existing) {
                await ctx.db.patch(existing._id, {
                    user_id: userId,
                    name: list.name,
                    position: list.position ?? 0,
                    created_at: list.created_at || getNowIso(),
                });
            } else {
                await ctx.db.insert("lists", {
                    list_id: list.list_id,
                    user_id: userId,
                    name: list.name,
                    position: list.position ?? 0,
                    created_at: list.created_at || getNowIso(),
                });
            }
        }

        const listItems = uniqueBy(args.listItems || [], (item) => `${item.list_id}:${item.imdb_id}`);
        assertImportCount("listItems", listItems.length);
        for (const item of listItems) {
            const existing = await ctx.db
                .query("list_items")
                .withIndex("by_list_imdb", (q: any) => q.eq("list_id", item.list_id).eq("imdb_id", item.imdb_id))
                .unique();
            if (existing) {
                await ctx.db.patch(existing._id, {
                    position: item.position ?? 0,
                    type: item.type || "movie",
                    poster: optionalString(item.poster),
                });
            } else {
                await ctx.db.insert("list_items", {
                    list_id: item.list_id,
                    imdb_id: item.imdb_id,
                    position: item.position ?? 0,
                    type: item.type || "movie",
                    poster: optionalString(item.poster),
                });
            }
        }

        return { ok: true };
    },
});

export const addAddon = mutationGeneric({
    args: { addon: v.any() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("addons")
            .withIndex("by_user_transport", (q: any) =>
                q.eq("user_id", userId).eq("transport_url", args.addon.transport_url),
            )
            .unique();
        if (existing) return existing;
        const id = await ctx.db.insert("addons", {
            user_id: userId,
            added_at: getNowIso(),
            transport_url: args.addon.transport_url,
            manifest: args.addon.manifest,
            flags: args.addon.flags,
            addon_id: args.addon.addon_id || crypto.randomUUID(),
        });
        return ctx.db.get(id);
    },
});

export const removeAddon = mutationGeneric({
    args: { transport_url: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("addons")
            .withIndex("by_user_transport", (q: any) =>
                q.eq("user_id", userId).eq("transport_url", args.transport_url),
            )
            .unique();
        if (existing) await ctx.db.delete(existing._id);
        return { ok: true };
    },
});

export const hideFromContinueWatching = mutationGeneric({
    args: { imdb_id: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("libraries")
            .withIndex("by_user_imdb", (q: any) => q.eq("user_id", userId).eq("imdb_id", args.imdb_id))
            .unique();
        if (existing) await ctx.db.patch(existing._id, { shown: false });
        return { ok: true };
    },
});

export const forgetProgress = mutationGeneric({
    args: { imdb_id: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("libraries")
            .withIndex("by_user_imdb", (q: any) => q.eq("user_id", userId).eq("imdb_id", args.imdb_id))
            .unique();
        if (existing) await ctx.db.delete(existing._id);
        return { ok: true };
    },
});

export const updateLibraryProgress = mutationGeneric({
    args: {
        imdb_id: v.string(),
        progress: v.any(),
        type: v.string(),
        completed: v.optional(v.boolean()),
        poster: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const now = getNowIso();
        const existing = await ctx.db
            .query("libraries")
            .withIndex("by_user_imdb", (q: any) => q.eq("user_id", userId).eq("imdb_id", args.imdb_id))
            .unique();
        const patch = {
            user_id: userId,
            imdb_id: args.imdb_id,
            progress: args.progress,
            last_watched: now,
            type: args.type,
            shown: true,
            completed_at: args.completed === true ? now : args.completed === false ? null : existing?.completed_at ?? null,
            poster: optionalString(args.poster ?? existing?.poster),
        };
        if (existing) {
            await ctx.db.patch(existing._id, patch);
            return { ...existing, ...patch };
        }
        const id = await ctx.db.insert("libraries", patch);
        return ctx.db.get(id);
    },
});

export const updateLibraryPoster = mutationGeneric({
    args: { imdb_id: v.string(), poster: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("libraries")
            .withIndex("by_user_imdb", (q: any) => q.eq("user_id", userId).eq("imdb_id", args.imdb_id))
            .unique();
        if (existing) await ctx.db.patch(existing._id, { poster: args.poster });
        return { ok: true };
    },
});

export const createList = mutationGeneric({
    args: { name: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const lists = await collectByUser(ctx.db, "lists", userId);
        const position = lists.length ? Math.max(...lists.map((list: any) => list.position || 0)) + 1 : 1;
        const row = {
            list_id: crypto.randomUUID(),
            user_id: userId,
            created_at: getNowIso(),
            name: args.name,
            position,
        };
        const id = await ctx.db.insert("lists", row);
        return (await ctx.db.get(id)) || row;
    },
});

export const updateList = mutationGeneric({
    args: { list_id: v.string(), updates: v.any() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("lists")
            .withIndex("by_list_id", (q: any) => q.eq("list_id", args.list_id))
            .unique();
        if (!existing || existing.user_id !== userId) return { ok: true };
        await ctx.db.patch(existing._id, args.updates || {});
        return { ok: true };
    },
});

export const deleteList = mutationGeneric({
    args: { list_id: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("lists")
            .withIndex("by_list_id", (q: any) => q.eq("list_id", args.list_id))
            .unique();
        if (!existing || existing.user_id !== userId) return { ok: true };
        const items = await ctx.db
            .query("list_items")
            .withIndex("by_list", (q: any) => q.eq("list_id", args.list_id))
            .collect();
        for (const item of items) {
            await ctx.db.delete(item._id);
        }
        await ctx.db.delete(existing._id);
        return { ok: true };
    },
});

export const addToList = mutationGeneric({
    args: {
        list_id: v.string(),
        imdb_id: v.string(),
        position: v.number(),
        type: v.string(),
        poster: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const list = await ctx.db
            .query("lists")
            .withIndex("by_list_id", (q: any) => q.eq("list_id", args.list_id))
            .unique();
        if (!list || list.user_id !== userId) throw new Error("List not found");
        const existing = await ctx.db
            .query("list_items")
            .withIndex("by_list_imdb", (q: any) => q.eq("list_id", args.list_id).eq("imdb_id", args.imdb_id))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, {
                position: args.position,
                type: args.type,
                poster: args.poster,
            });
            return { ok: true };
        }
        await ctx.db.insert("list_items", {
            list_id: args.list_id,
            imdb_id: args.imdb_id,
            position: args.position,
            type: args.type,
            poster: args.poster,
        });
        return { ok: true };
    },
});

export const removeFromList = mutationGeneric({
    args: { list_id: v.string(), imdb_id: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const list = await ctx.db
            .query("lists")
            .withIndex("by_list_id", (q: any) => q.eq("list_id", args.list_id))
            .unique();
        if (!list || list.user_id !== userId) return { ok: true };
        const existing = await ctx.db
            .query("list_items")
            .withIndex("by_list_imdb", (q: any) => q.eq("list_id", args.list_id).eq("imdb_id", args.imdb_id))
            .unique();
        if (existing) await ctx.db.delete(existing._id);
        return { ok: true };
    },
});

export const updateListItemPosition = mutationGeneric({
    args: { list_id: v.string(), imdb_id: v.string(), position: v.number() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const list = await ctx.db
            .query("lists")
            .withIndex("by_list_id", (q: any) => q.eq("list_id", args.list_id))
            .unique();
        if (!list || list.user_id !== userId) return { ok: true };
        const existing = await ctx.db
            .query("list_items")
            .withIndex("by_list_imdb", (q: any) => q.eq("list_id", args.list_id).eq("imdb_id", args.imdb_id))
            .unique();
        if (existing) await ctx.db.patch(existing._id, { position: args.position });
        return { ok: true };
    },
});

export const updateListItemPoster = mutationGeneric({
    args: { list_id: v.string(), imdb_id: v.string(), poster: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const list = await ctx.db
            .query("lists")
            .withIndex("by_list_id", (q: any) => q.eq("list_id", args.list_id))
            .unique();
        if (!list || list.user_id !== userId) return { ok: true };
        const existing = await ctx.db
            .query("list_items")
            .withIndex("by_list_imdb", (q: any) => q.eq("list_id", args.list_id).eq("imdb_id", args.imdb_id))
            .unique();
        if (existing) await ctx.db.patch(existing._id, { poster: args.poster });
        return { ok: true };
    },
});

export const createWatchParty = mutationGeneric({
    args: {
        imdbId: v.string(),
        streamSource: v.string(),
        season: v.optional(v.union(v.number(), v.null())),
        episode: v.optional(v.union(v.number(), v.null())),
        fileIdx: v.optional(v.union(v.number(), v.null())),
    },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const now = getNowIso();
        const row = {
            party_id: crypto.randomUUID(),
            host_user_id: userId,
            imdb_id: args.imdbId,
            season: args.season ?? null,
            episode: args.episode ?? null,
            stream_source: args.streamSource,
            file_idx: args.fileIdx ?? null,
            created_at: now,
            expires_at: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
            current_time_seconds: 0,
            is_playing: false,
            last_update: now,
        };
        const partyDocId = await ctx.db.insert("watch_parties", row);
        await ctx.db.insert("watch_party_members", {
            party_id: row.party_id,
            user_id: userId,
            joined_at: now,
            last_seen: now,
        });
        return (await ctx.db.get(partyDocId)) || row;
    },
});

export const joinWatchParty = mutationGeneric({
    args: { partyId: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const party = await ctx.db
            .query("watch_parties")
            .withIndex("by_party_id", (q: any) => q.eq("party_id", args.partyId))
            .unique();
        if (!party) throw new Error("Party not found");
        if (new Date(party.expires_at).getTime() < Date.now()) throw new Error("Party has expired");
        const existing = await ctx.db
            .query("watch_party_members")
            .withIndex("by_party_user", (q: any) => q.eq("party_id", args.partyId).eq("user_id", userId))
            .unique();
        if (!existing) {
            const now = getNowIso();
            await ctx.db.insert("watch_party_members", {
                party_id: args.partyId,
                user_id: userId,
                joined_at: now,
                last_seen: now,
            });
        }
        return { ok: true };
    },
});

export const leaveWatchParty = mutationGeneric({
    args: { partyId: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const membership = await ctx.db
            .query("watch_party_members")
            .withIndex("by_party_user", (q: any) => q.eq("party_id", args.partyId).eq("user_id", userId))
            .unique();
        if (membership) {
            await ctx.db.delete(membership._id);
        }

        const party = await ctx.db
            .query("watch_parties")
            .withIndex("by_party_id", (q: any) => q.eq("party_id", args.partyId))
            .unique();
        if (party && party.host_user_id === userId) {
            const members = await ctx.db
                .query("watch_party_members")
                .withIndex("by_party", (q: any) => q.eq("party_id", args.partyId))
                .collect();
            for (const member of members) {
                await ctx.db.delete(member._id);
            }
            await ctx.db.delete(party._id);
        }
        return { ok: true };
    },
});

export const updateWatchPartyState = mutationGeneric({
    args: {
        partyId: v.string(),
        currentTimeSeconds: v.number(),
        isPlaying: v.boolean(),
    },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const party = await ctx.db
            .query("watch_parties")
            .withIndex("by_party_id", (q: any) => q.eq("party_id", args.partyId))
            .unique();
        if (!party || party.host_user_id !== userId) return { ok: true };
        await ctx.db.patch(party._id, {
            current_time_seconds: args.currentTimeSeconds,
            is_playing: args.isPlaying,
            last_update: getNowIso(),
        });
        return { ok: true };
    },
});

export const getWatchParty = queryGeneric({
    args: { partyId: v.string() },
    handler: async (ctx, args) => {
        await requireAuthedUserId(ctx);
        const party = await ctx.db
            .query("watch_parties")
            .withIndex("by_party_id", (q: any) => q.eq("party_id", args.partyId))
            .unique();
        return party || null;
    },
});

export const getWatchPartyInfo = queryGeneric({
    args: { partyId: v.string() },
    handler: async (ctx, args) => {
        await requireAuthedUserId(ctx);
        const party = await ctx.db
            .query("watch_parties")
            .withIndex("by_party_id", (q: any) => q.eq("party_id", args.partyId))
            .unique();
        if (!party) return null;
        const members = await ctx.db
            .query("watch_party_members")
            .withIndex("by_party", (q: any) => q.eq("party_id", args.partyId))
            .collect();
        return {
            ...party,
            memberCount: members.length,
        };
    },
});

export const getActiveWatchParties = queryGeneric({
    args: {},
    handler: async (ctx) => {
        await requireAuthedUserId(ctx);
        const parties = await ctx.db.query("watch_parties").collect();
        const now = Date.now();
        return parties
            .filter((party: any) => new Date(party.expires_at).getTime() > now)
            .sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
    },
});

export const updateMemberLastSeen = mutationGeneric({
    args: { partyId: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("watch_party_members")
            .withIndex("by_party_user", (q: any) => q.eq("party_id", args.partyId).eq("user_id", userId))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, { last_seen: getNowIso() });
        }
        return { ok: true };
    },
});

export const getWatchPartyMembers = queryGeneric({
    args: { partyId: v.string() },
    handler: async (ctx, args) => {
        await requireAuthedUserId(ctx);
        return ctx.db
            .query("watch_party_members")
            .withIndex("by_party", (q: any) => q.eq("party_id", args.partyId))
            .collect();
    },
});

export const getTraktIntegrationInternal = internalQuery({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        return ctx.db
            .query("trakt_integrations")
            .withIndex("by_user", (q: any) => q.eq("user_id", args.userId))
            .unique();
    },
});

export const upsertTraktIntegrationInternal = internalMutation({
    args: {
        userId: v.string(),
        accessToken: v.string(),
        refreshToken: v.string(),
        scope: v.optional(v.string()),
        tokenType: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
        username: v.optional(v.string()),
        slug: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = getNowIso();
        const existing = await ctx.db
            .query("trakt_integrations")
            .withIndex("by_user", (q: any) => q.eq("user_id", args.userId))
            .unique();

        const patch = {
            user_id: args.userId,
            access_token: args.accessToken,
            refresh_token: args.refreshToken,
            scope: optionalString(args.scope),
            token_type: optionalString(args.tokenType),
            expires_at: args.expiresAt,
            username: optionalString(args.username),
            slug: optionalString(args.slug),
            updated_at: now,
        };

        if (existing) {
            await ctx.db.patch(existing._id, patch);
            return { ...existing, ...patch };
        }

        const id = await ctx.db.insert("trakt_integrations", {
            ...patch,
            created_at: now,
        });
        return ctx.db.get(id);
    },
});

export const deleteTraktIntegrationInternal = internalMutation({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("trakt_integrations")
            .withIndex("by_user", (q: any) => q.eq("user_id", args.userId))
            .unique();
        if (existing) {
            await ctx.db.delete(existing._id);
        }
        return { ok: true };
    },
});

export const getTraktStatus = queryGeneric({
    args: {},
    handler: async (ctx) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("trakt_integrations")
            .withIndex("by_user", (q: any) => q.eq("user_id", userId))
            .unique();
        const config = getTraktConfig();
        return {
            configured: config.configured,
            clientId: config.clientId ?? null,
            redirectUri: config.redirectUri,
            authorizeUrl: TRAKT_AUTHORIZE_URL,
            connected: Boolean(existing),
            username: existing?.username ?? null,
            slug: existing?.slug ?? null,
            scope: existing?.scope ?? null,
            updatedAt: existing?.updated_at ?? null,
            expiresAt: existing?.expires_at ?? null,
        };
    },
});

export const disconnectTrakt = mutationGeneric({
    args: {},
    handler: async (ctx) => {
        const userId = await requireAuthedUserId(ctx);
        const existing = await ctx.db
            .query("trakt_integrations")
            .withIndex("by_user", (q: any) => q.eq("user_id", userId))
            .unique();
        if (existing) {
            await ctx.db.delete(existing._id);
        }
        return { ok: true };
    },
});

export const exchangeTraktCode = actionGeneric({
    args: {
        code: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await requireAuthedUserId(ctx);
        const config = getTraktConfig();
        if (!config.clientId || !config.clientSecret) {
            throw new Error("Trakt is not configured on the server");
        }

        const tokenPayload = await exchangeOrRefreshTraktToken(
            {
                code: args.code,
                grant_type: "authorization_code",
                redirect_uri: config.redirectUri,
            },
            {
                clientId: config.clientId,
                clientSecret: config.clientSecret,
            },
        );

        const accessToken = optionalString(tokenPayload?.access_token);
        const refreshToken = optionalString(tokenPayload?.refresh_token);
        if (!accessToken || !refreshToken) {
            throw new Error("Trakt token exchange returned an invalid payload");
        }

        let profile = { username: undefined as string | undefined, slug: undefined as string | undefined };
        try {
            const settingsPayload = await fetchTraktSettings(config.clientId, accessToken);
            profile = getProfileValues(settingsPayload);
        } catch {
            // Profile is optional; token storage still succeeds.
        }

        await saveTraktIntegrationForUser(ctx, {
            userId,
            accessToken,
            refreshToken,
            scope: optionalString(tokenPayload?.scope),
            tokenType: optionalString(tokenPayload?.token_type),
            expiresAt: toExpiresAtMs(tokenPayload),
            username: profile.username,
            slug: profile.slug,
        });

        return {
            ok: true,
            connected: true,
            username: profile.username ?? null,
            slug: profile.slug ?? null,
            scope: optionalString(tokenPayload?.scope) ?? null,
            expiresAt: toExpiresAtMs(tokenPayload) ?? null,
        };
    },
});

export const refreshTraktToken = actionGeneric({
    args: {},
    handler: async (ctx) => {
        const userId = await requireAuthedUserId(ctx);
        const config = getTraktConfig();
        if (!config.clientId || !config.clientSecret) {
            throw new Error("Trakt is not configured on the server");
        }

        const integration = await getTraktIntegrationForUser(ctx, userId);
        if (!integration) {
            throw new Error("Trakt is not connected");
        }

        const tokenPayload = await exchangeOrRefreshTraktToken(
            {
                refresh_token: integration.refresh_token,
                grant_type: "refresh_token",
                redirect_uri: config.redirectUri,
            },
            {
                clientId: config.clientId,
                clientSecret: config.clientSecret,
            },
        );

        const accessToken = optionalString(tokenPayload?.access_token);
        const refreshToken = optionalString(tokenPayload?.refresh_token);
        if (!accessToken || !refreshToken) {
            throw new Error("Trakt refresh returned an invalid payload");
        }

        await saveTraktIntegrationForUser(ctx, {
            userId,
            accessToken,
            refreshToken,
            scope: optionalString(tokenPayload?.scope) || integration.scope,
            tokenType: optionalString(tokenPayload?.token_type) || integration.token_type,
            expiresAt: toExpiresAtMs(tokenPayload),
            username: integration.username,
            slug: integration.slug,
        });

        return { ok: true };
    },
});

export const traktScrobble = actionGeneric({
    args: {
        action: v.union(v.literal("start"), v.literal("pause"), v.literal("stop")),
        imdbId: v.string(),
        mediaType: v.union(v.literal("movie"), v.literal("episode")),
        season: v.optional(v.number()),
        episode: v.optional(v.number()),
        progress: v.number(),
        appVersion: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        try {
            const userId = await requireAuthedUserId(ctx);
            const config = getTraktConfig();
            if (!config.clientId || !config.clientSecret) {
                return { ok: false, reason: "not_configured" };
            }

            const integration = await getTraktIntegrationForUser(ctx, userId);
            if (!integration?.access_token || !integration?.refresh_token) {
                return { ok: false, reason: "not_connected" };
            }

            const progress = Math.max(0, Math.min(100, Number(args.progress) || 0));
            const payload: Record<string, any> = {
                progress,
            };

            if (optionalString(args.appVersion)) {
                payload.app_version = optionalString(args.appVersion);
            }

            if (args.mediaType === "movie") {
                payload.movie = {
                    ids: {
                        imdb: args.imdbId,
                    },
                };
            } else {
                const season = Number(args.season);
                const episode = Number(args.episode);
                if (!Number.isFinite(season) || !Number.isFinite(episode)) {
                    return { ok: false, reason: "missing_episode" };
                }
                payload.show = {
                    ids: {
                        imdb: args.imdbId,
                    },
                };
                payload.episode = {
                    season,
                    number: episode,
                };
            }

            const runScrobble = async (accessToken: string) => {
                const response = await fetch(`${TRAKT_API_BASE_URL}/scrobble/${args.action}`, {
                    method: "POST",
                    headers: buildTraktHeaders(config.clientId!, accessToken),
                    body: JSON.stringify(payload),
                });
                const body = await parseJsonSafe(response);
                return { response, body };
            };

            let activeAccessToken = integration.access_token;
            let result = await runScrobble(activeAccessToken);

            if (result.response.status === 401) {
                try {
                    const tokenPayload = await exchangeOrRefreshTraktToken(
                        {
                            refresh_token: integration.refresh_token,
                            grant_type: "refresh_token",
                            redirect_uri: config.redirectUri,
                        },
                        {
                            clientId: config.clientId,
                            clientSecret: config.clientSecret,
                        },
                    );
                    const refreshedAccess = optionalString(tokenPayload?.access_token);
                    const refreshedRefresh = optionalString(tokenPayload?.refresh_token);
                    if (refreshedAccess && refreshedRefresh) {
                        activeAccessToken = refreshedAccess;
                        await saveTraktIntegrationForUser(ctx, {
                            userId,
                            accessToken: refreshedAccess,
                            refreshToken: refreshedRefresh,
                            scope: optionalString(tokenPayload?.scope) || integration.scope,
                            tokenType: optionalString(tokenPayload?.token_type) || integration.token_type,
                            expiresAt: toExpiresAtMs(tokenPayload),
                            username: integration.username,
                            slug: integration.slug,
                        });
                        result = await runScrobble(activeAccessToken);
                    }
                } catch {
                    // Fall through and return the original error response below.
                }
            }

            if (result.response.ok) {
                return {
                    ok: true,
                    duplicate: false,
                    action: args.action,
                };
            }
            if (result.response.status === 409) {
                return {
                    ok: true,
                    duplicate: true,
                    action: args.action,
                };
            }

            return {
                ok: false,
                reason: "trakt_error",
                status: result.response.status,
                message: getTraktErrorMessage(result.response.status, result.body),
            };
        } catch (error: any) {
            return {
                ok: false,
                reason: "exception",
                message: String(error?.message || error || "Unknown error"),
            };
        }
    },
});

export const getTraktRecommendations = actionGeneric({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        try {
            const userId = await requireAuthedUserId(ctx);
            const config = getTraktConfig();
            if (!config.clientId) {
                return { ok: false, reason: "not_configured", recommendations: [] };
            }

            const integration = await getTraktIntegrationForUser(ctx, userId);
            if (!integration?.access_token || !integration?.refresh_token) {
                return { ok: true, connected: false, recommendations: [] };
            }

            const requestedLimit = Number(args.limit ?? 24);
            const limit = Math.max(1, Math.min(80, Number.isFinite(requestedLimit) ? requestedLimit : 24));
            const perType = Math.max(1, Math.ceil(limit / 2));

            const fetchForToken = async (accessToken: string) => {
                const [movieResponse, showResponse] = await Promise.all([
                    fetch(
                        `${TRAKT_API_BASE_URL}/recommendations/movies?limit=${perType}&ignore_collected=true`,
                        {
                            method: "GET",
                            headers: buildTraktHeaders(config.clientId!, accessToken),
                        },
                    ),
                    fetch(
                        `${TRAKT_API_BASE_URL}/recommendations/shows?limit=${perType}&ignore_collected=true`,
                        {
                            method: "GET",
                            headers: buildTraktHeaders(config.clientId!, accessToken),
                        },
                    ),
                ]);

                const moviePayload = await parseJsonSafe(movieResponse);
                const showPayload = await parseJsonSafe(showResponse);

                return {
                    movieResponse,
                    showResponse,
                    moviePayload,
                    showPayload,
                };
            };

            let activeAccessToken = integration.access_token;
            let result = await fetchForToken(activeAccessToken);

            const unauthorized =
                result.movieResponse.status === 401 || result.showResponse.status === 401;

            if (unauthorized) {
                if (!config.clientSecret) {
                    return {
                        ok: false,
                        reason: "refresh_not_configured",
                        recommendations: [],
                    };
                }
                try {
                    const tokenPayload = await exchangeOrRefreshTraktToken(
                        {
                            refresh_token: integration.refresh_token,
                            grant_type: "refresh_token",
                            redirect_uri: config.redirectUri,
                        },
                        {
                            clientId: config.clientId,
                            clientSecret: config.clientSecret,
                        },
                    );

                    const refreshedAccess = optionalString(tokenPayload?.access_token);
                    const refreshedRefresh = optionalString(tokenPayload?.refresh_token);
                    if (refreshedAccess && refreshedRefresh) {
                        activeAccessToken = refreshedAccess;
                        await saveTraktIntegrationForUser(ctx, {
                            userId,
                            accessToken: refreshedAccess,
                            refreshToken: refreshedRefresh,
                            scope: optionalString(tokenPayload?.scope) || integration.scope,
                            tokenType: optionalString(tokenPayload?.token_type) || integration.token_type,
                            expiresAt: toExpiresAtMs(tokenPayload),
                            username: integration.username,
                            slug: integration.slug,
                        });
                        result = await fetchForToken(activeAccessToken);
                    }
                } catch {
                    // Keep original result for error handling.
                }
            }

            const failedMovie = !result.movieResponse.ok;
            const failedShow = !result.showResponse.ok;
            if (failedMovie && failedShow) {
                return {
                    ok: false,
                    reason: "trakt_error",
                    message: getTraktErrorMessage(
                        result.movieResponse.status,
                        result.moviePayload,
                    ),
                    recommendations: [],
                };
            }

            const recommendations: Array<{
                imdbId: string;
                type: "movie" | "series";
                title: string | null;
                year: number | null;
            }> = [];

            const movieItems = Array.isArray(result.moviePayload) ? result.moviePayload : [];
            for (const item of movieItems) {
                const movie = item?.movie && typeof item.movie === "object" ? item.movie : item;
                const imdbId = optionalString(movie?.ids?.imdb);
                if (!imdbId) continue;
                recommendations.push({
                    imdbId,
                    type: "movie",
                    title: optionalString(movie?.title) ?? null,
                    year: Number.isFinite(Number(movie?.year)) ? Number(movie?.year) : null,
                });
            }

            const showItems = Array.isArray(result.showPayload) ? result.showPayload : [];
            for (const item of showItems) {
                const show = item?.show && typeof item.show === "object" ? item.show : item;
                const imdbId = optionalString(show?.ids?.imdb);
                if (!imdbId) continue;
                recommendations.push({
                    imdbId,
                    type: "series",
                    title: optionalString(show?.title) ?? null,
                    year: Number.isFinite(Number(show?.year)) ? Number(show?.year) : null,
                });
            }

            const deduped = new Map<string, (typeof recommendations)[number]>();
            for (const item of recommendations) {
                if (!deduped.has(item.imdbId)) {
                    deduped.set(item.imdbId, item);
                }
            }

            return {
                ok: true,
                connected: true,
                recommendations: Array.from(deduped.values()).slice(0, limit),
            };
        } catch (error: any) {
            return {
                ok: false,
                reason: "exception",
                message: String(error?.message || error || "Unknown error"),
                recommendations: [],
            };
        }
    },
});
