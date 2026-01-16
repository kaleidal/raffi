<script lang="ts">
    import type { ShowResponse } from "../../../lib/library/types/meta_types";

    const portal = (node: HTMLElement) => {
        if (typeof document === "undefined") {
            return { destroy() {} };
        }
        document.body.appendChild(node);
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
</script>

{#if loading}
    <div
        use:portal
        class="fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center flex-col gap-8"
    >
        {#if metaData}
            <div class="relative z-10 flex flex-col items-center gap-8">
                <img
                    src={metaData.meta.logo ?? ""}
                    alt="Logo"
                    class="w-100 object-contain animate-pulse"
                />
            </div>
        {/if}

        <div class="relative z-10 flex flex-col items-center gap-3 w-full max-w-130 px-8">
            <div class="text-white/90 text-[18px] font-medium text-center">{stage}</div>
            {#if details}
                <div class="text-white/70 text-[14px] text-center wrap-break-word">{details}</div>
            {/if}
            {#if progress !== null}
                <div class="w-full h-2 rounded-full bg-white/15 overflow-hidden">
                    <div
                        class="h-full bg-white/60 transition-all duration-300"
                        style={`width: ${Math.max(0, Math.min(1, progress)) * 100}%`}
                    ></div>
                </div>
            {/if}
        </div>

        <div class="absolute left-0 top-0 p-10 z-50">
            <button
                class="bg-[#000000]/20 backdrop-blur-md hover:bg-[#FFFFFF]/20 transition-colors duration-200 rounded-full p-4 cursor-pointer"
                on:click={onClose}
                aria-label="Close player"
            >
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M15 19L8 12L15 5"
                        stroke="white"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
        </div>
    </div>
{/if}
