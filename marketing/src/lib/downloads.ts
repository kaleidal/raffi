const LATEST = "https://dl.schelf.store/kaleidal/raffi/latest";

export const WEB_APP = "https://web.raffi.al";

export const SYSTEMS = [
    {
        id: "windows",
        name: "Windows",
        primary: { label: ".exe", href: `${LATEST}/windows-x86_64/exe` },
        others: [{ label: ".msi", href: `${LATEST}/windows-x86_64/msi` }],
    },
    {
        id: "mac",
        name: "macOS",
        note: "Apple silicon",
        primary: { label: ".dmg", href: `${LATEST}/macos-aarch64/dmg` },
        others: [{ label: ".zip", href: `${LATEST}/macos-aarch64/zip` }],
    },
    {
        id: "linux",
        name: "Linux",
        primary: { label: ".deb", href: `${LATEST}/linux-x86_64/deb` },
        others: [
            { label: ".rpm", href: `${LATEST}/linux-x86_64/rpm` },
            { label: "AppImage", href: `${LATEST}/linux-x86_64/appimage` },
        ],
    },
] as const;

export type SystemId = (typeof SYSTEMS)[number]["id"];

export function detectSystem(): SystemId {
    const agent = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
    if (agent.includes("mac")) return "mac";
    if (agent.includes("linux") && !agent.includes("android")) return "linux";
    return "windows";
}

export const systemOf = (id: SystemId) => SYSTEMS.find((system) => system.id === id)!;
