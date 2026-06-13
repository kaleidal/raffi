<script lang="ts">
    import { fade } from "svelte/transition";
</script>

<div in:fade={{ duration: 220 }} class="grid gap-10 md:grid-cols-12 md:gap-12">
    <div class="md:col-span-5">
        <h2 class="font-poppins text-[28px] leading-[1.1] tracking-[-0.03em] md:text-[34px]">
            What Raffi is
        </h2>
        <p class="mt-4 text-[15px] leading-6 text-neutral-600 md:text-[16px] md:leading-7">
            A modern, cross‑platform streaming app inspired by Stremio — built to feel faster and more intentional,
            while still using the Stremio addon ecosystem for discovery and sources.
        </p>
    </div>

    <div class="md:col-span-7">
        <div class="grid gap-8 md:grid-cols-2 md:gap-10">
            <div>
                <p class="text-[13px] font-medium text-neutral-500">Interface</p>
                <p class="mt-2 text-[15px] leading-6 text-neutral-700">
                    Clean detail pages, readable metadata, and a stream list that explains what you’re picking.
                </p>
            </div>
            <div>
                <p class="text-[13px] font-medium text-neutral-500">Compatibility</p>
                <p class="mt-2 text-[15px] leading-6 text-neutral-700">
                    Full Stremio addon support — keep your current addons and sources.
                </p>
            </div>
            <div>
                <p class="text-[13px] font-medium text-neutral-500">Watch together</p>
                <p class="mt-2 text-[15px] leading-6 text-neutral-700">
                    Real‑time watch parties with synchronized playback, plus chat and presence.
                </p>
            </div>
            <div>
                <p class="text-[13px] font-medium text-neutral-500">Quality of life</p>
                <p class="mt-2 text-[15px] leading-6 text-neutral-700">
                    Progress tracking, continue watching, and integrations like Discord Rich Presence.
                </p>
            </div>
        </div>
    </div>
</div>