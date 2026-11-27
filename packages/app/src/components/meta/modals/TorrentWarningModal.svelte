<script lang="ts">
    import Button from "../../common/controls/Button.svelte";
    import Dialog from "../../common/dialog/Dialog.svelte";

    let { onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void } = $props();
</script>

<Dialog title="Stream over BitTorrent?" onClose={onCancel}>
    <p class="leading-relaxed text-ink/75">
        Other peers can see your IP address while you stream. Use a VPN if torrenting isn't safe where you live.
    </p>

    {#snippet actions()}
        <Button onclick={onCancel}>Cancel</Button>
        <Button variant="primary" onclick={onConfirm}>Continue</Button>
    {/snippet}
</Dialog>
