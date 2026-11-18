<script lang="ts">
    import type { StremioImportPreviewItem } from "../../../../lib/import/stremioLibrary/types";
    import CheckMark from "./CheckMark.svelte";

    export let items: StremioImportPreviewItem[];
    export let selected: string[];

    $: allSelected = items.length > 0 && selected.length === items.length;

    const isSelected = (imdbId: string) => selected.includes(imdbId);

    const toggle = (imdbId: string) => {
        if (isSelected(imdbId)) {
            selected = selected.filter((id) => id !== imdbId);
        } else {
            selected = [...selected, imdbId];
        }
    };

    const setAll = (checked: boolean) => {
        selected = checked ? items.map((item) => item.imdbId) : [];
    };

    const formatType = (type: "movie" | "series") => (type === "movie" ? "Movie" : "Show");
</script>

<section class="flex flex-col gap-2 min-h-0">
    <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-ink font-medium">
            Library · {selected.length}/{items.length}
        </p>
        <button
            type="button"
            class="text-xs text-ink/50 hover:text-ink/80 transition-colors cursor-pointer"
            on:click={() => setAll(!allSelected)}
        >
            {allSelected ? "Clear all" : "Select all"}
        </button>
    </div>
    <ul class="flex flex-col gap-1 max-h-44 overflow-y-auto pr-1">
        {#each items as item (item.imdbId)}
            {@const checked = isSelected(item.imdbId)}
            <li>
                <label class="flex items-start gap-3 rounded-2xl bg-ink/6 px-3 py-2.5 cursor-pointer select-none hover:bg-ink/8 transition-colors">
                    <input
                        type="checkbox"
                        class="sr-only"
                        checked={checked}
                        on:change={() => toggle(item.imdbId)}
                    />
                    <CheckMark {checked} />
                    <span class="min-w-0 flex-1">
                        <span class="block text-sm text-ink truncate">{item.name}</span>
                        <span class="block text-xs text-ink/45">{formatType(item.type)}</span>
                    </span>
                </label>
            </li>
        {/each}
    </ul>
</section>
