const COLLAPSE_AFTER_PX = 24;

type Options = {
    header: HTMLElement | undefined;
    onChange: (collapsed: boolean) => void;
};

/** Hides the page header while a scroller inside the node is scrolled down. */
export function collapseOnScroll(node: HTMLElement, options: Options) {
    let current = options;
    let collapsed = false;

    const set = (next: boolean) => {
        if (next === collapsed) return;
        collapsed = next;
        current.onChange(next);
    };

    const handle = (event: Event) => {
        const scroller = event.target;
        if (!(scroller instanceof HTMLElement)) return;
        const overflow = scroller.scrollHeight - scroller.clientHeight;
        if (overflow <= 0) return;
        if (scroller.scrollTop <= 0) {
            set(false);
            return;
        }
        const stillScrollsOnceHeaderIsGone = overflow > (current.header?.offsetHeight ?? 0) + COLLAPSE_AFTER_PX;
        if (scroller.scrollTop > COLLAPSE_AFTER_PX && stillScrollsOnceHeaderIsGone) set(true);
    };

    node.addEventListener("scroll", handle, { capture: true, passive: true });
    return {
        update(next: Options) {
            current = next;
        },
        destroy() {
            node.removeEventListener("scroll", handle, { capture: true });
        },
    };
}
