<script lang="ts">
    import type { StremioAddonPreviewItem } from "../../../../lib/import/stremioImportPreview";
    import CheckMark from "./CheckMark.svelte";

    export let addons: StremioAddonPreviewItem[];
    export let selected: string[];

    $: importableCount = addons.filter((addon) => addon.supported && !addon.alreadyInstalled).length;
    $: allSelected = importableCount > 0 && selected.length === importableCount;

    const isSelected = (id: string) => selected.includes(id);

    const toggle = (id: string, disabled: boolean) => {
        if (disabled) return;
        if (isSelected(id)) {
            selected = selected.filter((addonId) => addonId !== id);
        } else {
            selected = [...selected, id];
        }
    };

    const setAll = (checked: boolean) => {
        selected = checked
            ? addons
                .filter((addon) => addon.supported && !addon.alreadyInstalled)
                .map((addon) => addon.id)
            : [];
    };
</script>

<section class="flex flex-col gap-2 min-h-0">
    <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-ink font-medium">
            Addons · {selected.length}/{importableCount || addons.length}
        </p>
        {#if importableCount > 0}
            <button
                type="button"
                class="text-xs text-ink/50 hover:text-ink/80 transition-colors cursor-pointer"
                on:click={() => setAll(!allSelected)}
            >
                {allSelected ? "Clear all" : "Select all"}
            </button>
        {/if}
    </div>
    <ul class="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1">
        {#each addons as addon (addon.id)}
            {@const checked = isSelected(addon.id)}
            {@const disabled = !addon.supported || addon.alreadyInstalled}
            <li>
                <label class="flex items-start gap-3 rounded-2xl px-3 py-2.5 select-none transition-colors {disabled ? 'opacity-45 cursor-default' : 'bg-ink/6 hover:bg-ink/8 cursor-pointer'}">
                    <input
                        type="checkbox"
                        class="sr-only"
                        checked={checked}
                        disabled={disabled}
                        on:change={() => toggle(addon.id, disabled)}
                    />
                    <CheckMark checked={checked && !disabled} />
                    <span class="min-w-0 flex-1">
                        <span class="block text-sm text-ink truncate">{addon.name}</span>
                        <span class="block text-xs text-ink/45 truncate">
                            {#if addon.alreadyInstalled}
                                Already in Raffi
                            {:else if !addon.supported}
                                Not supported in Raffi
                            {:else if addon.resources.length}
                                {addon.resources.join(", ")}
                            {:else}
                                Addon
                            {/if}
                        </span>
                    </span>
                </label>
            </li>
        {/each}
    </ul>
</section>
