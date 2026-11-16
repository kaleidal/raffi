export const supportsCustomThemes = Boolean(window.electronAPI?.themes);

export function loadCustomThemes() {
    const themes = window.electronAPI?.themes;
    if (!themes) return () => {};

    const style = document.createElement("style");
    style.dataset.raffiThemes = "";
    document.head.append(style);

    const apply = (css: string) => {
        style.textContent = css;
    };
    void themes.read().then(apply);
    const stopWatching = themes.onChanged(apply);

    return () => {
        stopWatching();
        style.remove();
    };
}

export function openThemesFolder() {
    void window.electronAPI?.themes?.openFolder();
}
