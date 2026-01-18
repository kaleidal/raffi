<script lang="ts">
    export let showSkipIntro = false;
    export let showNextEpisode = false;
    export let isWatchPartyMember = false;
    export let skipChapter: () => void;
    export let nextEpisode: () => void;
</script>

<div
    class="flex flex-col gap-2 w-full items-center justify-end transition-all duration-300"
>
    {#if showSkipIntro && !isWatchPartyMember}
        <button
            class="bg-white text-black px-6 py-2 rounded-full font-bold hover:bg-[#FFFFFF]/70 cursor-pointer transition-colors flex items-center gap-2"
            on:click={skipChapter}
        >
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M11.9997 5.99994C11.9998 5.60444 12.0937 5.21784 12.2695 4.88902C12.4453 4.5602 12.6952 4.30392 12.9875 4.15258C13.2798 4.00124 13.6014 3.96164 13.9117 4.03877C14.222 4.11591 14.5071 4.30632 14.7309 4.58594L19.5307 10.5859C19.8306 10.961 19.9991 11.4696 19.9991 11.9999C19.9991 12.5303 19.8306 13.0389 19.5307 13.4139L14.7309 19.4139C14.5071 19.6936 14.222 19.884 13.9117 19.9611C13.6014 20.0382 13.2798 19.9986 12.9875 19.8473C12.6952 19.696 12.4453 19.4397 12.2695 19.1109C12.0937 18.782 11.9998 18.3954 11.9997 17.9999V5.99994Z"
                    stroke="#000000"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
                <path
                    d="M4 5.99994C4.00007 5.60444 4.09394 5.21784 4.26975 4.88902C4.44556 4.5602 4.69541 4.30392 4.98772 4.15258C5.28003 4.00124 5.60167 3.96164 5.91199 4.03877C6.2223 4.11591 6.50736 4.30632 6.73111 4.58594L11.531 10.5859C11.8309 10.961 11.9994 11.4696 11.9994 11.9999C11.9994 12.5303 11.8309 13.0389 11.531 13.4139L6.73111 19.4139C6.50736 19.6936 6.2223 19.884 5.91199 19.9611C5.60167 20.0382 5.28003 19.9986 4.98772 19.8473C4.69541 19.696 4.44556 19.4397 4.26975 19.1109C4.09394 18.782 4.00007 18.3954 4 17.9999V5.99994Z"
                    stroke="#000000"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
            Skip Intro
        </button>
    {/if}

    {#if showNextEpisode && !isWatchPartyMember}
        <button
            class="bg-white text-black px-6 py-2 rounded-full font-bold hover:bg-[#FFFFFF]/70 cursor-pointer transition-colors flex items-center gap-2"
            on:click={nextEpisode}
        >
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M11.9997 5.99994C11.9998 5.60444 12.0937 5.21784 12.2695 4.88902C12.4453 4.5602 12.6952 4.30392 12.9875 4.15258C13.2798 4.00124 13.6014 3.96164 13.9117 4.03877C14.222 4.11591 14.5071 4.30632 14.7309 4.58594L19.5307 10.5859C19.8306 10.961 19.9991 11.4696 19.9991 11.9999C19.9991 12.5303 19.8306 13.0389 19.5307 13.4139L14.7309 19.4139C14.5071 19.6936 14.222 19.884 13.9117 19.9611C13.6014 20.0382 13.2798 19.9986 12.9875 19.8473C12.6952 19.696 12.4453 19.4397 12.2695 19.1109C12.0937 18.782 11.9998 18.3954 11.9997 17.9999V5.99994Z"
                    stroke="#000000"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
                <path
                    d="M4 5.99994C4.00007 5.60444 4.09394 5.21784 4.26975 4.88902C4.44556 4.5602 4.69541 4.30392 4.98772 4.15258C5.28003 4.00124 5.60167 3.96164 5.91199 4.03877C6.2223 4.11591 6.50736 4.30632 6.73111 4.58594L11.531 10.5859C11.8309 10.961 11.9994 11.4696 11.9994 11.9999C11.9994 12.5303 11.8309 13.0389 11.531 13.4139L6.73111 19.4139C6.50736 19.6936 6.2223 19.884 5.91199 19.9611C5.60167 20.0382 5.28003 19.9986 4.98772 19.8473C4.69541 19.696 4.44556 19.4397 4.26975 19.1109C4.09394 18.782 4.00007 18.3954 4 17.9999V5.99994Z"
                    stroke="#000000"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
            Next Episode
        </button>
    {/if}
</div>
