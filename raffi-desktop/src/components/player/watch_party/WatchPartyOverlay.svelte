<script lang="ts">
    import {
        watchParty,
        leaveWatchParty,
    } from "../../../lib/stores/watchPartyStore";
    import { fade, scale } from "svelte/transition";

    let showDetails = false;

    async function handleLeave() {
        await leaveWatchParty();
    }
</script>

{#if $watchParty.isActive}
    <div
        class="absolute top-6 right-6 z-50"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="bg-[#000000]/20 backdrop-blur-md hover:bg-[#202020]/20 transition-colors rounded-xl overflow-hidden"
            transition:scale={{ duration: 200, start: 0.95 }}
        >
            <button
                class="flex items-center gap-3 px-4 py-3 hover:bg-[#202020]/20 transition-colors w-full cursor-pointer"
                onclick={() => (showDetails = !showDetails)}
                aria-label={showDetails ? "Hide details" : "Show details"}
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    class="text-[#D3D3D3]"
                >
                    <path
                        d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                    />
                    <circle
                        cx="9"
                        cy="7"
                        r="4"
                        stroke="currentColor"
                        stroke-width="2"
                    />
                    <path
                        d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                    />
                </svg>
                <span class="text-white font-semibold"
                    >{$watchParty.memberCount}</span
                >
            </button>

            {#if showDetails}
                <div
                    class="border-t border-white/10 p-4 space-y-3 min-w-[220px]"
                >
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-[#D3D3D3] font-normal">Role</span>
                        <span
                            class="text-white font-semibold flex items-center gap-1.5"
                        >
                            {#if $watchParty.isHost}
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    class="text-yellow-500"
                                >
                                    <path
                                        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                                        fill="currentColor"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    />
                                </svg>
                                Host
                            {:else}
                                Viewer
                            {/if}
                        </span>
                    </div>

                    <div class="flex items-center justify-between text-sm">
                        <span class="text-[#D3D3D3] font-normal">Members</span>
                        <span class="text-white font-semibold"
                            >{$watchParty.memberCount}</span
                        >
                    </div>

                    {#if !$watchParty.isHost}
                        <div
                            class="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2 items-start"
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                class="text-blue-400 flex-shrink-0 mt-0.5"
                            >
                                <circle
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    stroke-width="2"
                                />
                                <path
                                    d="M12 16V12M12 8H12.01"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                />
                            </svg>
                            <span class="text-xs text-blue-400 leading-snug"
                                >Synced to host playback</span
                            >
                        </div>
                    {/if}

                    <button
                        class="w-full py-2 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium rounded-lg text-sm transition-colors cursor-pointer"
                        onclick={handleLeave}
                    >
                        Leave Party
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}
