<script lang="ts">
    const handleDoubleClick = () => {
        // When using Electron titleBarOverlay, the native buttons are drawn by the OS.
        // Keep this empty for now; the OS already supports standard behaviors.
    };
</script>

<div
    class="h-[32px] w-full flex items-center justify-between px-3 select-none text-white bg-[#090909] focus:outline-none"
    style="-webkit-app-region: drag"
    on:dblclick={() => handleDoubleClick()}
    on:keydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleDoubleClick();
        }
    }}
    role="button"
    tabindex="0"
>
    <div
        class="flex items-center gap-3 min-w-0"
        style="padding-right: env(titlebar-area-width, 140px)"
    >
    </div>
</div>
