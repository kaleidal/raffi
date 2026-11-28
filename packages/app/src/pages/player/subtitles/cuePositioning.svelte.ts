const CONTROLS_GAP_PX = 20;
const RESTING_SHARE = 0.06;

/** How far above the bottom of the player subtitles sit: clear of the controls while they show. */
export function createCuePositioning({
    getContainer,
    getPanel,
    isControlsVisible,
}: {
    getContainer: () => HTMLElement | undefined;
    getPanel: () => HTMLElement | null;
    isControlsVisible: () => boolean;
}) {
    let playerHeight = $state(0);
    let controlsReach = $state(0);

    $effect(() => {
        const container = getContainer();
        const panel = getPanel();
        if (!container) return;

        const measure = () => {
            playerHeight = container.clientHeight;
            controlsReach = panel ? (panel.offsetParent as HTMLElement).offsetHeight - panel.offsetTop : 0;
        };
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        if (panel) observer.observe(panel);
        return () => observer.disconnect();
    });

    return {
        get offset() {
            return isControlsVisible() && controlsReach ? controlsReach + CONTROLS_GAP_PX : playerHeight * RESTING_SHARE;
        },
    };
}
