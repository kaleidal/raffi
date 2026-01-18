import { writable } from "svelte/store";

const lockCount = writable(0);

const getContainer = () =>
    document.querySelector("[data-scroll-container]") as HTMLElement | null;

const applyLock = () => {
    const body = document.body;
    const html = document.documentElement;
    const container = getContainer();

    body.dataset.prevOverflow = body.style.overflow || "";
    body.dataset.prevPosition = body.style.position || "";
    body.dataset.prevTop = body.style.top || "";
    body.dataset.prevWidth = body.style.width || "";

    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    if (container) {
        container.dataset.prevOverflowY = container.style.overflowY || "";
        container.dataset.prevOverflowX = container.style.overflowX || "";
        container.dataset.scrollTop = String(container.scrollTop);
        container.style.overflowY = "hidden";
        container.style.overflowX = "hidden";
    }
};

const releaseLock = () => {
    const body = document.body;
    const html = document.documentElement;
    const container = getContainer();
    body.style.overflow = body.dataset.prevOverflow || "";
    body.style.position = body.dataset.prevPosition || "";
    body.style.top = body.dataset.prevTop || "";
    body.style.width = body.dataset.prevWidth || "";
    html.style.overflow = "";

    delete body.dataset.prevOverflow;
    delete body.dataset.prevPosition;
    delete body.dataset.prevTop;
    delete body.dataset.prevWidth;

    if (container) {
        const scrollTop = Number(container.dataset.scrollTop || "0");
        container.style.overflowY = container.dataset.prevOverflowY || "";
        container.style.overflowX = container.dataset.prevOverflowX || "";
        delete container.dataset.prevOverflowY;
        delete container.dataset.prevOverflowX;
        delete container.dataset.scrollTop;
        if (!Number.isNaN(scrollTop)) {
            container.scrollTop = scrollTop;
        }
    }

};

export const lockScroll = () => {
    let current = 0;
    lockCount.update((value) => {
        current = value + 1;
        return current;
    });
    if (current === 1) {
        applyLock();
    }
};

export const unlockScroll = () => {
    let current = 0;
    lockCount.update((value) => {
        current = Math.max(0, value - 1);
        return current;
    });
    if (current === 0) {
        releaseLock();
    }
};
