import { getTraktStatus, pollTraktDeviceSignIn, type TraktDeviceCode, type TraktStatus } from "../db/db";

const SLOW_DOWN_SECONDS = 5;

const pause = (seconds: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, seconds * 1000);
        signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });

export async function waitForTraktApproval(code: TraktDeviceCode, signal: AbortSignal): Promise<TraktStatus> {
    const deadline = Date.now() + code.expiresIn * 1000;
    let interval = code.interval;
    while (Date.now() < deadline) {
        await pause(interval, signal);
        if (signal.aborted) throw new DOMException("Trakt sign-in cancelled", "AbortError");
        const { status } = await pollTraktDeviceSignIn(code.deviceCode);
        if (status === "connected") return getTraktStatus();
        if (status === "denied") throw new Error("Trakt sign-in was declined");
        if (status === "expired") break;
        if (status === "slow-down") interval += SLOW_DOWN_SECONDS;
    }
    throw new Error("That Trakt code expired. Try connecting again");
}

export function openTraktActivation(url: string) {
    const electronApi = (window as any).electronAPI as { openExternal?: (url: string) => Promise<void> } | undefined;
    if (electronApi?.openExternal) void electronApi.openExternal(url);
    else window.open(url, "_blank", "noopener");
}
