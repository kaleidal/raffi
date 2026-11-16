import { version } from "../../../package.json";
import { getPlatformName, isTvPlatform } from "./platform";

const DESKTOP_SYSTEMS: Record<string, string> = { win32: "Windows", darwin: "macOS", linux: "Linux" };

export const appVersion = version;

export function platformLabel() {
    const platform = getPlatformName();
    if (platform === "desktop") return DESKTOP_SYSTEMS[window.electronAPI?.platform ?? ""] ?? "Desktop";
    if (platform === "android") return isTvPlatform ? "Android TV" : "Android";
    return "Web";
}
