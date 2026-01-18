<script lang="ts">
    import { fly } from 'svelte/transition';
</script>

<div in:fly={{ y: 50, duration: 500 }} class="flex flex-col gap-8 max-w-3xl">
    <div class="p-8 bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl transform -rotate-1">
        <h2 class="text-4xl font-bold text-black mb-6 tracking-tight font-handwritten">What is Raffi?</h2>
        <p class="text-xl text-black leading-relaxed font-medium">
            Raffi is basically <span class="bg-yellow-200 px-1">“what Stremio would look like if someone rebuilt it in 2025 and actually cared about UX.”</span> 
        </p>
        <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="p-4 bg-white border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h3 class="text-black font-bold text-lg mb-2">Modern Core</h3>
                <p class="text-black font-medium">No Rust core, no WASM bridge, no React tech‑debt jungle. Just a clean, modern codebase.</p>
            </div>
            <div class="p-4 bg-white border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h3 class="text-black font-bold text-lg mb-2">Full Compatibility</h3>
                <p class="text-black font-medium">Speaks the same addon protocol. All your existing Stremio plugins plug straight in.</p>
            </div>
        </div>
    </div>

    <div class="p-8 bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl transform rotate-1">
        <h2 class="text-3xl font-bold text-black mb-4 tracking-tight">Under the Hood</h2>
        <p class="text-black text-lg font-medium leading-relaxed mb-4">
            Deliberately simple: a <span class="font-bold underline decoration-wavy decoration-blue-400">Svelte</span> desktop interface wrapped in Electron, plus a <span class="font-bold underline decoration-wavy decoration-red-400">Go sidecar</span> that handles torrents, HLS, and transcoding cursed codecs.
        </p>
        <p class="text-black text-lg font-medium leading-relaxed">
            Instead of throwing raw filenames at you, it gives you clean show and movie pages, a stream list that actually explains quality/source, and a layout that feels closer to a premium service than a hobby project (because that’s what I’d want to use myself).
        </p>
    </div>
</div>