<script lang="ts">
    export let metaData: any;
</script>

<div class="flex flex-row gap-[20px]">
    <button
        class="px-[50px] py-[20px] flex flex-row gap-[20px] items-center cursor-pointer hover:bg-[#D3D3D3]/10 transition-all duration-200 bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] justify-center"
    >
        <svg
            width="30"
            height="30"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M11.6667 3.33337H28.3333M8.33333 10H31.6667M8.33333 16.6667H31.6667C33.5076 16.6667 35 18.1591 35 20V33.3334C35 35.1743 33.5076 36.6667 31.6667 36.6667H8.33333C6.49238 36.6667 5 35.1743 5 33.3334V20C5 18.1591 6.49238 16.6667 8.33333 16.6667Z"
                stroke="white"
                stroke-width="4"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>

        <span class="text-[#E1E1E1] text-[24px] font-poppins font-medium"
            >Add to list</span
        >
    </button>

    <button
        class="px-[50px] py-[20px] flex flex-row gap-[20px] items-center cursor-pointer hover:bg-[#D3D3D3]/10 transition-all duration-200 bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] justify-center"
        on:click={() =>
            window.open(
                `https://www.youtube.com/watch?v=${metaData.meta.trailers[0]?.source}`,
                "_blank",
            )}
    >
        <svg
            width="30"
            height="30"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M11.6667 5V35M5 12.5H11.6667M5 20H35M5 27.5H11.6667M28.3333 5V35M28.3333 12.5H35M28.3333 27.5H35M8.33333 5H31.6667C33.5076 5 35 6.49238 35 8.33333V31.6667C35 33.5076 33.5076 35 31.6667 35H8.33333C6.49238 35 5 33.5076 5 31.6667V8.33333C5 6.49238 6.49238 5 8.33333 5Z"
                stroke="white"
                stroke-width="4"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>

        <span class="text-[#E1E1E1] text-[24px] font-poppins font-medium"
            >Trailer</span
        >
    </button>
</div>
