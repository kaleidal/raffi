import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

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
