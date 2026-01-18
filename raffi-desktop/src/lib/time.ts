export function formatTime(t: number) {
    if (!isFinite(t) || t < 0) return "0:00";
    const hours = Math.floor(t / 3600);
    const minutes = Math.floor((t % 3600) / 60);
    const seconds = Math.floor(t % 60)
        .toString()
        .padStart(2, "0");

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`;
    }
    return `${minutes}:${seconds}`;
}
