<script lang="ts">
    import { MonitorDown } from "@lucide/svelte";
    import { isWeb } from "../../../lib/shell/platform";
    import Button from "../../common/controls/Button.svelte";
    import Dialog from "../../common/dialog/Dialog.svelte";

    let {
        errorMessage = "Stream failed to load",
        errorDetails = "",
        onRetry,
        onBack,
        onDownloadDesktop,
    }: {
        errorMessage?: string;
        errorDetails?: string;
        onRetry: () => void;
        onBack: () => void;
        onDownloadDesktop: () => void;
    } = $props();
</script>

<Dialog title="Playback error" fullscreen>
    <div class="flex flex-col gap-2">
        <p class="leading-relaxed text-ink/75">{errorMessage}</p>
        {#if errorDetails}
            <p class="font-mono text-sm break-words text-ink/45 select-text">{errorDetails}</p>
        {/if}
    </div>

    {#snippet actions()}
        {#if isWeb}
            <Button variant="ghost" class="mr-auto" onclick={onDownloadDesktop}>
                <MonitorDown size={18} strokeWidth={2} />
                Get the desktop app
            </Button>
        {/if}
        <Button onclick={onBack}>Back to streams</Button>
        <Button variant="primary" onclick={onRetry}>Try again</Button>
    {/snippet}
</Dialog>
