<script lang="ts">
    import type { ShowResponse } from "../../../lib/library/types/meta_types";

    export let loading: boolean;
    export let onClose: () => void;
    export let metaData: ShowResponse | null;
</script>

{#if loading}
    <div
        class="fixed inset-0 z-50 backdrop-blur-[12px] flex items-center justify-center flex-col gap-8"
    >
        {#if metaData}
            <div class="relative z-10 flex flex-col items-center gap-8">
                <img
                    src={metaData.meta.logo ?? ""}
                    alt="Logo"
                    class="w-[400px] object-contain animate-pulse"
                />
            </div>
        {/if}

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
