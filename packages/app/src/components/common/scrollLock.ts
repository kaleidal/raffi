let lockCount = 0;
let restore: (() => void) | null = null;

function lock() {
    const body = document.body;
    const html = document.documentElement;
    const container = document.querySelector<HTMLElement>("[data-scroll-container]");
    const scrollY = window.scrollY;
    const previous = {
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        containerOverflowX: container?.style.overflowX ?? "",
        containerOverflowY: container?.style.overflowY ?? "",
    };

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";
    if (container) {
        container.style.overflowX = "hidden";
        container.style.overflowY = "hidden";
    }

    return () => {
        body.style.overflow = previous.overflow;
        body.style.position = previous.position;
        body.style.top = previous.top;
        body.style.width = previous.width;
        html.style.overflow = "";
        if (container) {
            container.style.overflowX = previous.containerOverflowX;
            container.style.overflowY = previous.containerOverflowY;
        }
        window.scrollTo(0, scrollY);
    };
}

/** Keeps the page behind a modal still for as long as the element is mounted. */
export function lockPageScroll(_node: HTMLElement) {
    if (lockCount++ === 0) restore = lock();
    return {
        destroy() {
            if (--lockCount === 0) {
                restore?.();
                restore = null;
            }
        },
    };
}
