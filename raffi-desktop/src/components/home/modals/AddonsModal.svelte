<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import { onDestroy } from "svelte";
    import { X } from "lucide-svelte";

    import { trackEvent } from "../../../lib/analytics";
    import CommunityAddonsSection from "./addons/CommunityAddonsSection.svelte";
    import InstalledAddonsSection from "./addons/InstalledAddonsSection.svelte";

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


    export let showAddonsModal = false;

    let bodyLocked = false;
    let hasTrackedOpen = false;

    const toggleBodyScroll = (active: boolean) => {
        if (typeof document === "undefined") return;
        const body = document.body;
        const html = document.documentElement;
        const container = document.querySelector(
            "[data-scroll-container]",
        ) as HTMLElement | null;
        const count = Number(body.dataset.modalCount || "0");
        if (active) {
            if (count === 0) {
                const scrollY = window.scrollY;
                body.dataset.scrollY = String(scrollY);
                body.dataset.prevOverflow = body.style.overflow || "";
                body.dataset.prevPosition = body.style.position || "";
                body.dataset.prevTop = body.style.top || "";
                body.dataset.prevWidth = body.style.width || "";
                body.style.overflow = "hidden";
                body.style.position = "fixed";
                body.style.top = `-${scrollY}px`;
                body.style.width = "100%";
                html.style.overflow = "hidden";
            if (container) {
                container.dataset.prevOverflowY = container.style.overflowY || "";
                container.dataset.prevOverflowX = container.style.overflowX || "";
                container.style.overflowY = "hidden";
                container.style.overflowX = "hidden";
            }

            }
            body.dataset.modalCount = String(count + 1);
            return;
        }
        const next = Math.max(0, count - 1);
        body.dataset.modalCount = String(next);
        if (next === 0) {
            const scrollY = Number(body.dataset.scrollY || "0");
            body.style.overflow = body.dataset.prevOverflow || "";
            body.style.position = body.dataset.prevPosition || "";
            body.style.top = body.dataset.prevTop || "";
            body.style.width = body.dataset.prevWidth || "";
            html.style.overflow = "";
            delete body.dataset.prevOverflow;
            delete body.dataset.prevPosition;
            delete body.dataset.prevTop;
            delete body.dataset.prevWidth;
            delete body.dataset.scrollY;
            if (container) {
                container.style.overflowY = container.dataset.prevOverflowY || "";
                container.style.overflowX = container.dataset.prevOverflowX || "";
                delete container.dataset.prevOverflowY;
                delete container.dataset.prevOverflowX;
            }
            window.scrollTo(0, scrollY);
        }
    };

    const updateBodyLock = (active: boolean) => {
        if (active && !bodyLocked) {
            toggleBodyScroll(true);
            bodyLocked = true;
        } else if (!active && bodyLocked) {
            toggleBodyScroll(false);
            bodyLocked = false;
        }
    };

    function closeModal() {
        trackEvent("addons_modal_closed");
        showAddonsModal = false;
    }

    $: updateBodyLock(showAddonsModal);

    onDestroy(() => {
        updateBodyLock(false);
    });

    $: if (showAddonsModal && !hasTrackedOpen) {
        hasTrackedOpen = true;
        trackEvent("addons_modal_opened");
    }

    $: if (!showAddonsModal && hasTrackedOpen) {
        hasTrackedOpen = false;
    }
</script>

{#if showAddonsModal}
    <div
        use:portal
        class="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex"
        transition:fade={{ duration: 200 }}
        on:click|self={closeModal}
        on:keydown={(e) => e.key === "Escape" && closeModal()}
        on:wheel|preventDefault|stopPropagation
        role="button"
        tabindex="0"
        style="padding: clamp(20px, 5vw, 150px);"
    >

        <div
            class="bg-[#121212] w-full h-full rounded-[32px] p-6 md:p-10 flex flex-col gap-6 relative overflow-hidden shadow-[0_40px_160px_rgba(0,0,0,0.55)]"
            transition:scale={{ start: 0.95, duration: 200 }}
            on:wheel|stopPropagation
        >

            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 class="text-white text-3xl font-poppins font-bold">
                        Manage Addons
                    </h2>
                    <p class="text-white/60 text-sm">
                        Combine community streams/subtitles with your installed sources.
                    </p>
                </div>
                <button
                    class="self-end text-white/50 hover:text-white cursor-pointer"
                    on:click={closeModal}
                    aria-label="Close modal"
                >

                    <X size={24} strokeWidth={2} />
                </button>
            </div>

            <div class="flex-1 min-h-0">
                <div class="flex h-full flex-col gap-6 overflow-hidden lg:flex-row lg:gap-8">
                    <CommunityAddonsSection />
                    <InstalledAddonsSection />
                </div>
            </div>
        </div>
    </div>
{/if}
