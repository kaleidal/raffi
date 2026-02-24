const getElectronApi = () =>
    (window as any).electronAPI as
        | {
              showConfirmDialog?: (message: string, title?: string) => Promise<boolean>;
              showAlertDialog?: (message: string, title?: string) => Promise<boolean>;
          }
        | undefined;

const refocusDocument = () => {
    if (typeof window === "undefined") return;
    queueMicrotask(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active && typeof active.focus === "function") {
            active.focus();
            return;
        }
        if (typeof window.focus === "function") {
            window.focus();
        }
    });
};

export async function confirmDialog(message: string, title = "Confirm"): Promise<boolean> {
    const api = getElectronApi();
    if (api?.showConfirmDialog) {
        const result = await api.showConfirmDialog(message, title);
        refocusDocument();
        return Boolean(result);
    }

    const result = window.confirm(message);
    refocusDocument();
    return result;
}

export async function alertDialog(message: string, title = "Raffi"): Promise<void> {
    const api = getElectronApi();
    if (api?.showAlertDialog) {
        await api.showAlertDialog(message, title);
        refocusDocument();
        return;
    }

    window.alert(message);
    refocusDocument();
}
