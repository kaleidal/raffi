<script lang="ts">
    import {getMetaData} from "./lib/library/library";
    import type {ShowResponse} from "./lib/library/types/meta_types";
    import {onMount} from "svelte";

    let imdbID: string = "tt2661044";
    let loadedMeta: boolean = false;
    let metaData: ShowResponse

    let episodes: number = 0;
    let seasons: number = 0;

    let seasonsArray: number[] = [];
    let currentSeason: number = 1;

    const truncateWords = (text: string, maxWords: number) => {
        if (!text) return "";
        const words = text.split(/\s+/);
        if (words.length <= maxWords) return text;
        return words.slice(0, maxWords).join(" ") + "…";
    };

    onMount(async() => {
        metaData = await getMetaData(imdbID);
        loadedMeta = true;

        episodes = metaData.meta.videos.length;
        seasons = Math.max(...metaData.meta.videos.map(video => video.season));

        for (let i = 1; i <= seasons; i++) {
            seasonsArray.push(i);
        }
    });
</script>

{#if loadedMeta}
    <div class="bg-[#090909] flex-1">
        <div class="w-screen h-screen">
            <img src={metaData.meta.background ?? ""} alt="Cover" class="h-screen opacity-60 w-full object-cover" />
            <div class="p-40 absolute top-0 left-0 h-screen w-screen flex gap-[50px] flex-row justify-between items-start">
                <div class="w-[40vw] h-full flex gap-[50px] flex-col justify-between items-start">
                    <div class="flex flex-col gap-[20px] justify-start items-start">
                        <img src={metaData.meta.logo ?? ""} alt="Logo" class="h-[250px] w-auto object-contain" />
                        <span class="text-[#E1E1E1] text-[20px] font-[500]">{metaData.meta.description ?? ""}</span>
                    </div>

                    <button class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[20px] text-black text-[48px] font-poppins font-medium px-[130px] py-[25px] rounded-[50px] mt-10 transition-colors duration-200">
                        <svg width="70" height="70" viewBox="0 0 92 92" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M23 11.5L76.6667 46L23 80.5V11.5Z" stroke="black" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>

                        Watch S1E1
                    </button>
                </div>

                <div class="flex flex-col gap-[20px] h-full justify-end items-end">
                    <div class="px-[60px] py-[40px] bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] flex flex-col gap-[20px]">
                        <span class="text-[#E1E1E1] text-[32px] font-poppins font-bold">0/{episodes} episodes watched</span>
                        <div class="w-full h-[10px] bg-[#A3A3A3]/30 rounded-full overflow-hidden">
                            <div class="h-full bg-white rounded-full" style="width: 0%"></div>
                            <div class="h-full bg-[#A3A3A3]/30 rounded-full" style="width: 100%"></div>
                        </div>
                    </div>

                    <div class="px-[60px] py-[40px] bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] flex flex-col gap-[20px] justify-center">
                        <span class="text-[#E1E1E1] text-[32px] font-poppins font-bold">{episodes} episodes • {seasons} seasons</span>

                        <div class="flex flex-row gap-[10px] items-center justify-between">
                            <span class="text-[#E8E8E8]/80 text-[24px] font-poppins font-medium">{metaData.meta.year}</span>

                            <div class="flex flex-row gap-[10px] items-center">
                                <span class="text-[#E8E8E8]/80 text-[24px] font-poppins font-medium">{metaData.meta.imdbRating}</span>

                                <img src="/imdb.png" alt="IMDB Logo" class="h-[50px] w-auto object-contain cursor-pointer hover:opacity-60 transition-opacity duration-200" on:click={() => window.location.href=`https://www.imdb.com/title/${metaData.meta.imdb_id}`} />
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-row gap-[20px]">
                        <button class="px-[50px] py-[20px] flex flex-row gap-[20px] items-center cursor-pointer hover:bg-[#D3D3D3]/10 transition-all duration-200 bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] justify-center">
                            <svg width="30" height="30" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M11.6667 3.33337H28.3333M8.33333 10H31.6667M8.33333 16.6667H31.6667C33.5076 16.6667 35 18.1591 35 20V33.3334C35 35.1743 33.5076 36.6667 31.6667 36.6667H8.33333C6.49238 36.6667 5 35.1743 5 33.3334V20C5 18.1591 6.49238 16.6667 8.33333 16.6667Z" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>

                            <span class="text-[#E1E1E1] text-[24px] font-poppins font-medium">Add to list</span>
                        </button>

                        <button
                             class="px-[50px] py-[20px] flex flex-row gap-[20px] items-center cursor-pointer hover:bg-[#D3D3D3]/10 transition-all duration-200 bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] justify-center"
                             on:click={() => window.open(`https://www.youtube.com/watch?v=${metaData.meta.trailers[0]?.source}`, '_blank')}
                        >
                            <svg width="30" height="30" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M11.6667 5V35M5 12.5H11.6667M5 20H35M5 27.5H11.6667M28.3333 5V35M28.3333 12.5H35M28.3333 27.5H35M8.33333 5H31.6667C33.5076 5 35 6.49238 35 8.33333V31.6667C35 33.5076 33.5076 35 31.6667 35H8.33333C6.49238 35 5 33.5076 5 31.6667V8.33333C5 6.49238 6.49238 5 8.33333 5Z" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>

                            <span class="text-[#E1E1E1] text-[24px] font-poppins font-medium">Trailer</span>
                        </button>
                    </div>
                </div>
            </div>

            <span class="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-[#E1E1E1]/60 text-[16px] font-poppins font-medium">scroll down to view episodes</span>
        </div>

        <div class="w-screen p-40">
            <div class="flex flex-row gap-[20px] mb-10">
                {#each seasonsArray as season}
                    <button class="px-[30px] py-[15px] {currentSeason === season ? 'bg-[#FFFFFF]/20 hover:bg-[#D3D3D3]/20' : 'bg-[#FFFFFF]/10 hover:bg-[#D3D3D3]/10'} backdrop-blur-2xl rounded-full text-[#E1E1E1] text-[20px] font-poppins font-medium cursor-pointer transition-colors duration-200" on:click={() => currentSeason = season}>
                        Season {season}
                    </button>
                {/each}
            </div>

            <div class="grid grid-cols-4 gap-[30px]">
                {#each metaData.meta.videos.filter(video => video.season === currentSeason) as episode}
                    <div class="bg-[#121212] rounded-[20px] overflow-hidden cursor-pointer hover:scale-[1.03] hover:-rotate-2 transition-transform duration-200">
                        <img src={episode.thumbnail} alt="Episode Thumbnail" class="w-full h-auto object-cover" />
                        <div class="p-5 flex flex-col gap-[10px]">
                            <span class="text-[#E1E1E1] text-[18px] font-poppins font-semibold">S{episode.season}E{episode.episode} - {episode.name}</span>
                            <span class="text-[#A3A3A3] text-[14px] font-poppins font-medium">{truncateWords(episode.description ?? "", 50)}</span>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    </div>
{/if}