<script lang="ts">
    export let text: string;
</script>

<button on:click class="hero-button cursor-pointer font-poppins text-black hover:underline text-[48px] font-[300] flex flex-row gap-[20px] items-center">
    {text}

    <svg class="hero-button__icon" width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line class="hero-button__shaft" x1="12.5" y1="30" x2="47.5" y2="30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <polyline class="hero-button__head" points="34 18 47.5 30 34 42" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
</button>

<style>
    .hero-button {
        --arrow-scale: 1;
        --arrow-slide: 0px;
    }

    .hero-button:hover {
        --arrow-scale: 1.35;
        --arrow-slide: 12px; /* keep arrowhead glued to the elongated shaft */
    }

    .hero-button__icon {
        overflow: visible;
    }

    .hero-button__shaft,
    .hero-button__head {
        transition: transform 320ms cubic-bezier(0.3, 0, 0.2, 1);
    }

    .hero-button__shaft {
        transform-origin: 12px 30px;
        transform-box: fill-box;
        transform: scaleX(var(--arrow-scale));
    }

    .hero-button__head {
        transform: translateX(var(--arrow-slide));
    }
</style>