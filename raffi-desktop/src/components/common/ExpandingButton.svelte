<script lang="ts">
    export let label: string = "";
    export let onClick: () => void = () => {};
</script>

<button
    class="bg-[#6E6E6E]/50 hover:bg-[#7A7A7A]/55 flex flex-row gap-[10px] items-center h-[48px] cursor-pointer w-auto rounded-full px-[15px] transition-all duration-200 ease-out"
    on:click={onClick}
    aria-label={label}
>
    <slot />
</button>
