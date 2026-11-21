<script lang="ts">
    import { Library, Settings, Tv } from "@lucide/svelte";
    import LoadingSpinner from "../../common/loading/LoadingSpinner.svelte";
    import { router, type Route } from "../../../lib/stores/router";
    import { showLiveInHeader } from "../../../lib/live/preferences";
    import { openSettings } from "../../../lib/stores/settings";
    import { currentUser, authInitializing, updateStatus } from "../../../lib/stores/authStore";

    type NavItem = { label: string; icon: typeof Library; page?: Route; onSelect: () => void };

    const items = $derived<NavItem[]>([
        { label: "Lists", icon: Library, page: "lists", onSelect: () => router.navigate("lists") },
        ...($showLiveInHeader ? [{ label: "Live", icon: Tv, page: "live" as Route, onSelect: () => router.navigate("live") }] : []),
    ]);

    const updateProgress = $derived(
        Math.max(8, Math.min(100, Math.round($updateStatus.downloaded ? 100 : ($updateStatus.downloadProgress ?? 8)))),
    );
</script>

<div class="flex flex-row items-start gap-[10px]">
    <nav class="header-nav flex items-center gap-1 rounded-full bg-raised/80 p-1.5 backdrop-blur-md">
        {#each items as item (item.label)}
            {@const active = item.page === $router.page}
            <button
                class="nav-item flex h-full cursor-pointer items-center gap-2.5 rounded-full font-medium transition-colors duration-200 {active
                    ? 'bg-accent text-on-accent'
                    : 'text-ink/75 hover:bg-ink/10 hover:text-ink'}"
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                onclick={item.onSelect}
            >
                <item.icon size={22} strokeWidth={2} />
                <span class="nav-label">{item.label}</span>
            </button>
        {/each}
    </nav>

    <div class="flex flex-col items-center">
        <button
            class="header-avatar group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-full bg-raised/80 text-ink/75 backdrop-blur-md transition-colors duration-300 hover:bg-raised/50 disabled:cursor-wait"
            aria-label="Settings"
            disabled={$authInitializing}
            onclick={() => openSettings()}
        >
            {#if $authInitializing}
                <LoadingSpinner size="26px" />
            {:else if $currentUser?.avatar}
                <img src={$currentUser.avatar} alt="" class="h-full w-full object-cover" loading="lazy" />
                <span class="pointer-events-none absolute inset-0 bg-black/25 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>
            {:else if $currentUser}
                <span class="text-2xl font-semibold text-ink uppercase">
                    {($currentUser.name || $currentUser.email || "?").slice(0, 1)}
                </span>
            {:else}
                <Settings size={24} strokeWidth={2} />
            {/if}
        </button>

        {#if $updateStatus.available}
            <div class="mt-2 h-[3px] w-[54px] overflow-hidden rounded-full bg-ink/25">
                <div class="h-full bg-accent transition-[width] duration-300" style="width: {updateProgress}%"></div>
            </div>
        {/if}
    </div>
</div>

<style>
    .header-nav,
    .header-avatar {
        height: clamp(56px, 4vw, 80px);
    }
    .header-avatar {
        width: clamp(56px, 4vw, 80px);
    }
    .nav-item {
        padding-inline: clamp(14px, 1.2vw, 22px);
        font-size: clamp(15px, 1vw, 19px);
    }
    .nav-item :global(svg) {
        width: clamp(20px, 1.4vw, 26px);
        height: clamp(20px, 1.4vw, 26px);
    }
    @media (max-width: 1100px), (orientation: portrait) {
        .nav-label {
            display: none;
        }
        .nav-item {
            aspect-ratio: 1;
            justify-content: center;
            padding-inline: 0;
        }
    }
</style>
