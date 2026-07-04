export const portalToBody = (node: HTMLElement) => {
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
