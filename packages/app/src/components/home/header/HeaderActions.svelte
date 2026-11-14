<script lang="ts">
    import { Link, Blocks, Library, Settings, Tv } from "@lucide/svelte";
    import LoadingSpinner from "../../common/LoadingSpinner.svelte";
    import { router } from "../../../lib/stores/router";
    import { isAndroidPlatform } from "../../../lib/shell/platform";
    import { allowTorrenting } from "../../../lib/stores/torrenting";
    import { showLiveInHeader } from "../../../lib/live/preferences";
    import { currentUser, authInitializing, updateStatus } from "../../../lib/stores/authStore";

    export let onOpenPlay: () => void;
    export let onOpenAddons: () => void;
    export let onOpenSettings: () => void;

    $: onLive = $router.page === "live";
    $: updateProgressPercent = Math.max(
        8,
        Math.min(
            100,
            Math.round(
                $updateStatus.downloaded
                    ? 100
                    : typeof $updateStatus.downloadProgress === "number"
                      ? $updateStatus.downloadProgress
                      : 8,
            ),
        ),
    );

    const action =
        "header-action bg-[#2C2C2C]/80 rounded-[clamp(18px,1.3vw,24px)] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-[width,height,border-radius,background-color] duration-300 cursor-pointer";
</script>

<div class="flex flex-row items-start gap-[10px]">
    {#if !onLive && (!isAndroidPlatform || $allowTorrenting)}
        <button class={action} aria-label="Play" onclick={onOpenPlay}>
            <Link size={40} strokeWidth={2} color="#C3C3C3" />
        </button>
    {/if}

    {#if !onLive}
        <button class={action} aria-label="addons" onclick={onOpenAddons}>
            <Blocks size={40} strokeWidth={2} color="#C3C3C3" />
        </button>
    {/if}

    {#if $showLiveInHeader && !onLive}
        <button class={action} aria-label="Live TV" onclick={() => router.navigate("live")}>
            <Tv size={40} strokeWidth={2} color="#C3C3C3" />
        </button>
    {/if}

    <button class={action} aria-label="lists" onclick={() => router.navigate("lists")}>
        <Library size={40} strokeWidth={2} color="#C3C3C3" />
    </button>

    <div class="flex flex-col items-center">
        <button
            class={`header-action group relative bg-[#2C2C2C]/80 rounded-[clamp(18px,1.3vw,24px)] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-[width,height,border-radius,background-color] duration-300 ${$authInitializing
                ? "cursor-wait pointer-events-none overflow-hidden"
                : $currentUser
                    ? "cursor-pointer overflow-hidden"
                    : "cursor-pointer"}`}
            aria-label="settings"
            onclick={onOpenSettings}
        >
            {#if $authInitializing}
                <div class="w-full h-full bg-white/10 flex items-center justify-center">
                    <LoadingSpinner size="30px" />
                </div>
            {:else if $currentUser}
                <div class="w-full h-full bg-white/10 group-hover:bg-black/35 transition-colors duration-300 flex items-center justify-center">
                    {#if $currentUser.avatar}
                        <img src={$currentUser.avatar} alt="Profile" class="w-full h-full object-cover" loading="lazy" />
                        <span class="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></span>
                    {:else}
                        <span class="text-white text-2xl font-semibold uppercase">
                            {($currentUser.name || $currentUser.email || "?").slice(0, 1)}
                        </span>
                    {/if}
                </div>
            {:else}
                <Settings size={40} strokeWidth={2} color="#C3C3C3" />
            {/if}
        </button>

        {#if $updateStatus.available}
            <div class="mt-2 h-[3px] w-[54px] rounded-full bg-white/25 overflow-hidden">
                <div class="h-full bg-white transition-[width] duration-300" style={`width: ${updateProgressPercent}%`}></div>
            </div>
        {/if}
    </div>
</div>

<style>
    .header-action {
        display: flex;
        width: clamp(56px, 4vw, 80px);
        height: clamp(56px, 4vw, 80px);
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
    }
    .header-action :global(svg) {
        width: clamp(24px, 1.7vw, 32px);
        height: clamp(24px, 1.7vw, 32px);
        transition: width 300ms cubic-bezier(0.22, 1, 0.36, 1), height 300ms cubic-bezier(0.22, 1, 0.36, 1);
    }
</style>
