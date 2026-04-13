<script lang="ts">
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import { ChevronLeft } from "@lucide/svelte";
    import { overlayZoomStyle } from "../../../lib/overlayZoom";

    const portal = (node: HTMLElement) => {
        if (typeof document === "undefined") {
            return { destroy() {} };
        }
        const target = document.fullscreenElement || document.body;
        target.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    };

    export let loading: boolean;
    export let onClose: () => void;
    export let metaData: ShowResponse | null;

	export let stage: string = "Loading...";
	export let details: string = "";
	export let progress: number | null = null;
    export let backdropSrc: string | null = null;
    export let backdropMode: "art" | "frame" = "art";

    $: effectiveBackdropSrc = backdropSrc ?? metaData?.meta?.background ?? metaData?.meta?.poster ?? "";
    $: isFrameBackdrop = backdropMode === "frame" && Boolean(backdropSrc);
</script>

{#if loading}
    <div
        use:portal
        class="fixed inset-0 z-50 flex items-center justify-center flex-col gap-8 overflow-hidden bg-black"
        style={overlayZoomStyle}
    >
        {#if effectiveBackdropSrc}
            <div class="absolute inset-0">
                <img
                    src={effectiveBackdropSrc}
                    alt=""
                    class={`h-full w-full object-cover ${isFrameBackdrop ? "scale-102 blur-lg opacity-70" : "scale-105 blur-xl opacity-62"}`}
                />
            </div>
        {/if}

        <div class={`absolute inset-0 ${isFrameBackdrop ? "bg-[#090909]/48" : "bg-[#090909]/58"}`}></div>
        <div class={`absolute inset-0 bg-linear-to-t ${isFrameBackdrop ? "from-[#090909]/82 via-[#090909]/46 to-[#090909]/18" : "from-[#090909]/90 via-[#090909]/58 to-[#090909]/24"}`}></div>

        {#if metaData}
            <div class="relative z-10 flex flex-col items-center gap-8">
                <img
                    src={metaData.meta.logo ?? ""}
                    alt="Logo"
                    class="w-100 object-contain animate-pulse drop-shadow-[0_10px_40px_rgba(0,0,0,0.45)]"
                />
            </div>
        {/if}

        <div class="relative z-10 flex flex-col items-center gap-3 w-full max-w-130 px-8">
            <div class="text-white/92 text-[18px] font-medium text-center">{stage}</div>
            {#if details}
                <div class="text-white/72 text-[14px] text-center wrap-break-word">{details}</div>
            {/if}
            {#if progress !== null}
                <div class="w-full h-2 rounded-full bg-white/18 overflow-hidden backdrop-blur-sm">
                    <div
                        class="h-full bg-white/72 transition-all duration-300"
                        style={`width: ${Math.max(0, Math.min(1, progress)) * 100}%`}
                    ></div>
                </div>
            {/if}
        </div>

        <div class="absolute left-0 top-0 p-10 z-50">
            <button
                class="bg-[#000000]/28 backdrop-blur-md hover:bg-[#FFFFFF]/20 transition-colors duration-200 rounded-full p-4 cursor-pointer"
                on:click={onClose}
                aria-label="Close player"
            >
                <ChevronLeft size={30} color="white" strokeWidth={2} />
            </button>
        </div>
    </div>
{/if}
