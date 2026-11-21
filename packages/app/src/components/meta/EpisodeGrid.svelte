<script lang="ts">
    import type { Episode, ShowResponse } from "../../lib/library/types/meta_types";
    import { Check, FileVideo } from "@lucide/svelte";

    export let metaData: ShowResponse;
    export let currentSeason: number;
    export let progressMap: any = {};

    export let onEpisodeClick: (episode: Episode) => void = () => {};
    export let onEpisodeContextMenu: (detail: { event: MouseEvent; episode: Episode }) => void = () => {};

    let failedImages = new Set<string>();

    function handleImageError(key: string) {
        failedImages.add(key);
        failedImages = failedImages;
    }

    $: episodes = metaData.meta.videos.filter((video) => video.season === currentSeason);
</script>

<div class="episode-grid">
    {#each episodes as episode (`${episode.season}:${episode.episode}`)}
        {@const key = `${episode.season}:${episode.episode}`}
        {@const progress = progressMap[key]}
        {@const watched = Boolean(progress?.watched)}

        <button
            class="group flex cursor-pointer flex-col gap-3 text-left"
            on:click={() => onEpisodeClick(episode)}
            on:contextmenu|preventDefault={(event) => onEpisodeContextMenu({ event, episode })}
        >
            <div
                class="relative aspect-video w-full overflow-hidden rounded-[18px] bg-surface transition-[translate,box-shadow] duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_14px_30px_rgba(0,0,0,0.3)]"
            >
                {#if episode.thumbnail && !failedImages.has(key)}
                    <img
                        src={episode.thumbnail}
                        alt=""
                        width="480"
                        height="270"
                        loading="lazy"
                        class="h-full w-full object-cover transition-[scale,filter] duration-200 {watched
                            ? 'brightness-[0.55] grayscale'
                            : 'group-hover:scale-[1.03]'}"
                        on:error={() => handleImageError(key)}
                    />
                {:else}
                    <div class="flex h-full w-full items-center justify-center text-ink/25">
                        <FileVideo size={36} strokeWidth={2} />
                    </div>
                {/if}

                {#if watched}
                    <span class="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-accent text-on-accent">
                        <Check size={18} strokeWidth={2.5} />
                    </span>
                {:else if progress?.time > 0}
                    <div class="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-white/25">
                        <div class="h-full rounded-full bg-accent" style="width: {(progress.time / progress.duration) * 100}%"></div>
                    </div>
                {/if}
            </div>

            <div class="flex flex-col gap-1 px-1">
                <p class="text-[clamp(15px,1vw,19px)] leading-snug font-semibold {watched ? 'text-ink/55' : 'text-ink'}">
                    <span class="text-ink/45">{episode.episode}</span>
                    {episode.name}
                </p>
                {#if episode.description}
                    <p class="line-clamp-2 text-[clamp(13px,0.8vw,15px)] leading-snug text-ink/55">{episode.description}</p>
                {/if}
            </div>
        </button>
    {/each}
</div>

<style>
    .episode-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(clamp(220px, 18vw, 320px), 1fr));
        gap: clamp(24px, 2vw, 40px) clamp(16px, 1.55vw, 30px);
    }

    @media (orientation: portrait) {
        .episode-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 20px 12px;
        }
    }
</style>
