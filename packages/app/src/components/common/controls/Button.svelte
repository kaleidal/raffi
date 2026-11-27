<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLButtonAttributes } from "svelte/elements";

    type Variant = "primary" | "secondary" | "ghost";

    let {
        variant = "secondary",
        class: className = "",
        children,
        ...rest
    }: HTMLButtonAttributes & { variant?: Variant; children: Snippet } = $props();

    const VARIANTS: Record<Variant, string> = {
        primary: "bg-accent text-on-accent hover:bg-accent/88",
        secondary: "bg-ink/10 text-ink hover:bg-ink/16",
        ghost: "text-ink/70 hover:bg-ink/8 hover:text-ink",
    };
</script>

<button
    class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-2.5 font-semibold whitespace-nowrap transition-[background-color,color,scale] duration-150 active:scale-97 disabled:cursor-default disabled:opacity-50 disabled:active:scale-100 {VARIANTS[
        variant
    ]} {className}"
    {...rest}
>
    {@render children()}
</button>
