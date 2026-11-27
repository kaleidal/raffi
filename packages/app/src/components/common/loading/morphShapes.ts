const POINTS = 96;
const RADIUS = 45;

type Outline = (angle: number) => number;

const scalloped = (lobes: number, depth: number): Outline => (angle) =>
    (1 + depth * Math.cos(lobes * angle)) / (1 + depth);

const ellipse = (width: number, height: number): Outline => (angle) =>
    (width * height) / Math.hypot(height * Math.cos(angle), width * Math.sin(angle));

const pill: Outline = (angle) => {
    const exponent = 4;
    const [x, y] = [Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle))];
    return 1 / ((x ** exponent + (y / 0.62) ** exponent) ** (1 / exponent));
};

const OUTLINES: Outline[] = [
    scalloped(9, 0.07),
    scalloped(12, 0.045),
    scalloped(5, 0.13),
    pill,
    scalloped(8, 0.09),
    scalloped(4, 0.14),
    ellipse(1, 0.8),
];

const toPath = (outline: Outline) => {
    const points = Array.from({ length: POINTS }, (_, index) => {
        const angle = (index / POINTS) * Math.PI * 2;
        const radius = RADIUS * outline(angle);
        return `${(50 + radius * Math.cos(angle)).toFixed(2)} ${(50 + radius * Math.sin(angle)).toFixed(2)}`;
    });
    return `M ${points.join(" L ")} Z`;
};

export const SHAPE_PATHS = OUTLINES.map(toPath);

/** Each morph adds a share of two full turns, so the loop lands back where it started. */
export const TURN_PER_SHAPE = 720 / OUTLINES.length;
