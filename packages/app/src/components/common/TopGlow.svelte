<script lang="ts">
    export let color = "#D9D9D9";
    export let opacity = 0.6;

    const filterId = `top-glow-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="pointer-events-none w-full absolute top-0 left-0 overflow-hidden">
    <svg viewBox="0 0 1858 591" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g filter={`url(#${filterId})`}>
            <ellipse cx="929" cy="95.5" rx="529" ry="95.5" fill={color} fill-opacity={opacity} />
        </g>
        <defs>
            <filter id={filterId} x="0" y="-400" width="1858" height="991" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                <feFlood flood-opacity="0" result="BackgroundImageFix" />
                <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                <feGaussianBlur stdDeviation="200" />
            </filter>
        </defs>
    </svg>
</div>
