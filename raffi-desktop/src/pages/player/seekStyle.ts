export type SeekBarStyle = "raffi" | "normal";

const SEEK_BAR_STYLE_KEY = "seek_bar_style";
const SEEK_STYLE_INFO_ACK_KEY = "seek_style_info_ack";

export const getSeekBarStyleFromStorage = (): SeekBarStyle => {
    const value = localStorage.getItem(SEEK_BAR_STYLE_KEY);
    return value === "normal" ? "normal" : "raffi";
};

export const shouldShowSeekStyleInfoModal = (): boolean => {
    const ack = localStorage.getItem(SEEK_STYLE_INFO_ACK_KEY);
    if (ack === "true") return false;

    const storedSeek = localStorage.getItem(SEEK_BAR_STYLE_KEY);
    if (storedSeek !== null) return false;

    return true;
};

export const persistSeekBarStyle = (style: SeekBarStyle) => {
    localStorage.setItem(SEEK_BAR_STYLE_KEY, style);
};

export const acknowledgeSeekStyleInfo = () => {
    localStorage.setItem(SEEK_STYLE_INFO_ACK_KEY, "true");
};
