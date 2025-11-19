<script lang="ts">
    export let widthProgress: number = 0;
    export let widthGrey: number = 100;
    export let value: number;
    export let label: string | undefined = "";
    export let min: number = 0;
    export let max: number = 1;
    export let step: number = 0.01;
    export let onInput: (event: Event) => void;
    export let onChange: (event: Event) => void = () => {};
</script>

<div class="flex flex-col items-start gap-1 ml-auto">
    {#if label}
        <span class="text-[#878787] text-[15px] font-poppins font-medium"
            >{label}</span
        >
    {/if}
    <div
        class="relative w-full h-[4px] hover:h-2 cursor-pointer transition-all duration-150"
    >
        <div
            class="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-150"
            style={`width:${widthProgress}%`}
        ></div>

        <div
            class="absolute inset-y-0 right-0 rounded-full bg-[#A3A3A3]/30 transition-[width] duration-150"
            style={`width:${widthGrey}%`}
        ></div>

        <input
            type="range"
            {min}
            {max}
            {step}
            bind:value
            on:input={onInput}
            on:change={onChange}
            class="relative z-10 w-full h-3 appearance-none bg-transparent cursor-pointer"
        />
    </div>
</div>

<style>
    /* kill default thumb */
    input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        width: 0;
        height: 0;
    }

    /* show thumb only on hover / active */
    input[type="range"]:hover::-webkit-slider-thumb,
    input[type="range"]:active::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: #ffffff;
        top: 50%;
        transform: translateY(-50%);
    }

    input[type="range"]::-moz-range-thumb {
        width: 0;
        height: 0;
        border: none;
    }

    input[type="range"]:hover::-moz-range-thumb,
    input[type="range"]:active::-moz-range-thumb {
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: #ffffff;
        top: 50%;
        transform: translateY(-50%);
    }

    input[type="range"]::-ms-thumb {
        width: 0;
        height: 0;
        border: none;
    }

    input[type="range"]:hover::-ms-thumb,
    input[type="range"]:active::-ms-thumb {
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: #ffffff;
        top: 50%;
        transform: translateY(-50%);
    }
</style>
