import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    addons: defineTable({
        user_id: v.string(),
        added_at: v.string(),
        transport_url: v.string(),
        manifest: v.any(),
        flags: v.optional(v.any()),
        addon_id: v.string(),
    })
        .index("by_user", ["user_id"])
        .index("by_user_transport", ["user_id", "transport_url"]),

    libraries: defineTable({
        user_id: v.string(),
        imdb_id: v.string(),
        progress: v.any(),
        last_watched: v.string(),
        completed_at: v.optional(v.union(v.string(), v.null())),
        type: v.string(),
        shown: v.boolean(),
        poster: v.optional(v.string()),
    })
        .index("by_user", ["user_id"])
        .index("by_user_imdb", ["user_id", "imdb_id"]),

    lists: defineTable({
        list_id: v.string(),
        user_id: v.string(),
        created_at: v.string(),
        name: v.string(),
        position: v.number(),
    })
        .index("by_user", ["user_id"])
        .index("by_list_id", ["list_id"]),

    list_items: defineTable({
        list_id: v.string(),
        imdb_id: v.string(),
        position: v.number(),
        type: v.string(),
        poster: v.optional(v.string()),
    })
        .index("by_list", ["list_id"])
        .index("by_list_imdb", ["list_id", "imdb_id"]),

    watch_parties: defineTable({
        party_id: v.string(),
        host_user_id: v.string(),
        imdb_id: v.string(),
        season: v.optional(v.union(v.number(), v.null())),
        episode: v.optional(v.union(v.number(), v.null())),
        stream_source: v.string(),
        file_idx: v.optional(v.union(v.number(), v.null())),
        created_at: v.string(),
        expires_at: v.string(),
        current_time_seconds: v.number(),
        is_playing: v.boolean(),
        last_update: v.string(),
    })
        .index("by_party_id", ["party_id"])
        .index("by_host", ["host_user_id"]),

    watch_party_members: defineTable({
        party_id: v.string(),
        user_id: v.string(),
        joined_at: v.string(),
        last_seen: v.string(),
    })
        .index("by_party", ["party_id"])
        .index("by_party_user", ["party_id", "user_id"]),

    trakt_integrations: defineTable({
        user_id: v.string(),
        username: v.optional(v.string()),
        slug: v.optional(v.string()),
        access_token: v.string(),
        refresh_token: v.string(),
        scope: v.optional(v.string()),
        token_type: v.optional(v.string()),
        expires_at: v.optional(v.number()),
        created_at: v.string(),
        updated_at: v.string(),
    }).index("by_user", ["user_id"]),
});
