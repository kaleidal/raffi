<script lang="ts">
    import { portal } from "../../common/portal";
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { Play, ListVideo, Check, CircleX, CheckCircle, Ban, Trash } from "@lucide/svelte";

    let {
        x,
        y,
        onClose = () => {},
        onWatch = () => {},
        onChooseSource = () => {},
        onMarkWatched = () => {},
        onMarkUnwatched = () => {},
        onResetProgress = () => {},
        onMarkSeasonWatched = () => {},
        onMarkSeasonUnwatched = () => {},
    }: {
        x: number;
        y: number;
        onClose?: () => void;
        onWatch?: () => void;
        onChooseSource?: () => void;
        onMarkWatched?: () => void;
        onMarkUnwatched?: () => void;
        onResetProgress?: () => void;
        onMarkSeasonWatched?: () => void;
        onMarkSeasonUnwatched?: () => void;
    } = $props();

    function close() {
        onClose();
    }

    function handleWatch() {
        onWatch();
        close();
    }

    function handleMarkWatched() {
        onMarkWatched();
        close();
    }

    function handleMarkUnwatched() {
        onMarkUnwatched();
        close();
    }

    function handleResetProgress() {
        onResetProgress();
        close();
    }

    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest(".context-menu")) {
            close();
        }
    }

    onMount(() => {
        document.addEventListener("click", handleClickOutside);
        return () => {
            document.removeEventListener("click", handleClickOutside);
        };
    });
</script>

<div
    use:portal
    class="fixed z-[300] context-menu bg-surface rounded-xl py-2 min-w-[200px] flex flex-col"
    style={`top: ${y}px; left: ${x}px;`}
    transition:fade={{ duration: 100 }}
    oncontextmenu={(event) => event.preventDefault()}
    role="menu"
    tabindex="-1"
>
    <button
        class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        onclick={handleWatch}
    >
        <Play size={16} strokeWidth={2} />
        Watch
    </button>
    <button
        class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        onclick={() => {
            onChooseSource();
            close();
        }}
    >
        <ListVideo size={16} strokeWidth={2} />
        Choose Source
    </button>
    <button
        class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        onclick={handleMarkWatched}
    >
        <Check size={16} strokeWidth={2} />
        Mark as Watched
    </button>
    <button
        class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        onclick={handleMarkUnwatched}
    >
        <CircleX size={16} strokeWidth={2} />
        Mark as Unwatched
    </button>
    <button
        class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        onclick={() => {
            onMarkSeasonWatched();
            close();
        }}
    >
        <CheckCircle size={16} strokeWidth={2} />
        Mark Season as Watched
    </button>
    <button
        class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        onclick={() => {
            onMarkSeasonUnwatched();
            close();
        }}
    >
        <Ban size={16} strokeWidth={2} />
        Mark Season as Unwatched
    </button>
    <div class="h-[1px] bg-ink/10 my-1"></div>
    <button
        class="text-left px-4 py-2 text-danger hover:bg-danger/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        onclick={handleResetProgress}
    >
        <Trash size={16} strokeWidth={2} />
        Reset Progress
    </button>
</div>
