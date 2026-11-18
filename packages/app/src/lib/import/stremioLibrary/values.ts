export const isPlainObject = (value: unknown): value is Record<string, any> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const toFiniteNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
