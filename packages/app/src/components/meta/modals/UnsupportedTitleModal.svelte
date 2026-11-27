<script lang="ts">
    import Button from "../../common/controls/Button.svelte";
    import Dialog from "../../common/dialog/Dialog.svelte";

    let {
        title = "Unsupported title",
        message = "This title is not currently supported.",
        onBack,
        onRetry,
    }: {
        title?: string;
        message?: string;
        onBack: () => void;
        onRetry: () => void;
    } = $props();
</script>

<Dialog {title}>
    <p class="leading-relaxed text-ink/75">{message}</p>

    {#snippet actions()}
        <Button onclick={onBack}>Go back</Button>
        <Button variant="primary" onclick={onRetry}>Try again</Button>
    {/snippet}
</Dialog>
