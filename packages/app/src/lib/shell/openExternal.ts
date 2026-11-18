export async function openExternal(url: string) {
    const open = window.electronAPI?.openExternal;
    if (open) await open(url);
    else window.open(url, "_blank", "noopener,noreferrer");
}
