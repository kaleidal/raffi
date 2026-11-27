<script lang="ts">
    import type { Snippet } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { X } from "@lucide/svelte";
    import { fullscreenPortal, portal } from "../portal";
    import { lockPageScroll } from "../scrollLock";

    let {
        title,
        onClose,
        fullscreen = false,
        bare = false,
        class: className = "max-w-[480px]",
        leading,
        actions,
        children,
    }: {
        title?: string;
        /** Lets Escape, the backdrop and a close button dismiss the dialog; without it the dialog waits for a choice. */
        onClose?: () => void;
        /** Shows the dialog over the fullscreen player instead of the page. */
        fullscreen?: boolean;
        /** Leaves out the surface's padding, background and header, for dialogs that draw their own. */
        bare?: boolean;
        class?: string;
        leading?: Snippet;
        actions?: Snippet;
        children: Snippet;
    } = $props();

    const titleId = $props.id();
    let surface = $state<HTMLDivElement>();

    $effect(() => {
        if (surface && !surface.contains(document.activeElement)) surface.focus({ preventScroll: true });
    });

    const attach = (node: HTMLElement) => (fullscreen ? fullscreenPortal : portal)(node);

    function closeOnEscape(event: KeyboardEvent) {
        if (event.key !== "Escape" || !onClose) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
    }
</script>

<div
    use:attach
    use:lockPageScroll
    class="raffi-modal-backdrop fixed inset-0 z-400 flex items-center justify-center bg-canvas/56 backdrop-blur-xl"
    transition:fade={{ duration: 200 }}
    onclick={(event) => event.target === event.currentTarget && onClose?.()}
    onkeydown={closeOnEscape}
    role="presentation"
>
    <div
        bind:this={surface}
        class="raffi-modal-surface relative flex w-full flex-col overflow-hidden rounded-[32px] text-ink shadow-[0_40px_160px_rgba(0,0,0,0.45)] focus:outline-none {bare
            ? ''
            : 'gap-6 bg-raised/70 p-[clamp(22px,2.2vw,32px)] backdrop-blur-[40px]'} {className}"
        transition:scale={{ start: 0.96, duration: 200 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabindex="-1"
    >
        {#if !bare && (title || onClose)}
            <div class="flex shrink-0 items-center gap-3">
                {@render leading?.()}
                {#if title}
                    <h2 id={titleId} class="min-w-0 flex-1 text-2xl font-semibold">{title}</h2>
                {/if}
                {#if onClose}
                    <button
                        class="-mr-2 ml-auto shrink-0 cursor-pointer rounded-full p-2 text-ink/50 transition-colors hover:bg-ink/8 hover:text-ink"
                        aria-label="Close"
                        onclick={onClose}
                    >
                        <X size={22} strokeWidth={2} />
                    </button>
                {/if}
            </div>
        {/if}

        {@render children()}

        {#if actions}
            <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {@render actions()}
            </div>
        {/if}
    </div>
</div>
