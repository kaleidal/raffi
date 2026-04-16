<script lang="ts">
    import { fade } from "svelte/transition";
    import { onMount } from "svelte";
    
    type ReleaseAsset = {
        name: string;
        browser_download_url: string;
    };
    type LatestReleaseResponse = {
        assets?: ReleaseAsset[];
    };
    
    type DownloadUrls = {
        exe: string;
        msi: string;
        deb: string;
        appimage: string;
        rpm: string;
        dmg: string;
        macZip: string;
    };
    
    let downloadUrls: DownloadUrls = $state({
        exe: "",
        msi: "",
        deb: "",
        appimage: "",
        rpm: "",
        dmg: "",
        macZip: ""
    });
    
    type UserOS = "windows" | "mac" | "linux";
    let userOS: UserOS = $state("windows");
    
    onMount(async () => {
        const platform = navigator.platform.toLowerCase();
        const userAgent = navigator.userAgent.toLowerCase();
        
        if (platform.includes('mac') || userAgent.includes('mac')) {
            userOS = 'mac';
        } else if (platform.includes('linux') || userAgent.includes('linux')) {
            userOS = 'linux';
        } else if (platform.includes('win') || userAgent.includes('windows')) {
            userOS = 'windows';
        }
        
        // Fetch latest release from GitHub
        try {
            const response = await fetch('https://api.github.com/repos/kaleidal/raffi/releases/latest');
            const release = (await response.json()) as LatestReleaseResponse;
            
            (release.assets ?? []).forEach((asset) => {
                if (asset.name.endsWith('.exe') && asset.name.includes('Setup')) {
                    downloadUrls.exe = asset.browser_download_url;
                } else if (asset.name.endsWith('.msi')) {
                    downloadUrls.msi = asset.browser_download_url;
                } else if (asset.name.endsWith('.deb')) {
                    downloadUrls.deb = asset.browser_download_url;
                } else if (asset.name.endsWith('.AppImage')) {
                    downloadUrls.appimage = asset.browser_download_url;
                } else if (asset.name.endsWith('.rpm')) {
                    downloadUrls.rpm = asset.browser_download_url;
                } else if (asset.name.endsWith('.dmg')) {
                    downloadUrls.dmg = asset.browser_download_url;
                } else if (asset.name.endsWith('-mac.zip')) {
                    downloadUrls.macZip = asset.browser_download_url;
                }
            });
        } catch (error) {
            console.error('Failed to fetch releases:', error);
        }
    });

    function bestDownloadFor(os: UserOS): { label: string; href: string } | null {
        if (os === "windows") {
            if (downloadUrls.exe) return { label: "Windows (.exe)", href: downloadUrls.exe };
            if (downloadUrls.msi) return { label: "Windows (.msi)", href: downloadUrls.msi };
            return null;
        }
        if (os === "mac") {
            if (downloadUrls.dmg) return { label: "macOS (.dmg)", href: downloadUrls.dmg };
            if (downloadUrls.macZip) return { label: "macOS (.zip)", href: downloadUrls.macZip };
            return null;
        }
        if (downloadUrls.deb) return { label: "Linux (.deb)", href: downloadUrls.deb };
        if (downloadUrls.rpm) return { label: "Linux (.rpm)", href: downloadUrls.rpm };
        if (downloadUrls.appimage) return { label: "Linux (.AppImage)", href: downloadUrls.appimage };
        return null;
    }
    
    const recommended = $derived.by(() => bestDownloadFor(userOS));
</script>

<div in:fade={{ duration: 220 }} class="grid gap-10 md:grid-cols-12 md:gap-12">
    <div class="md:col-span-5">
        <h2 class="font-poppins text-[28px] leading-[1.1] tracking-[-0.03em] md:text-[34px]">
            Download
        </h2>
        <p class="mt-4 text-[15px] leading-6 text-neutral-600 md:text-[16px] md:leading-7">
            We’ll suggest a build based on your device. You can also grab any format below.
        </p>
        <p class="mt-4 text-[13px] leading-5 text-neutral-500">
            The app may not be code‑signed, so Windows can show SmartScreen. If you downloaded it from GitHub Releases,
            it’s expected.
        </p>
    </div>

    <div class="md:col-span-7">
        <div class="rounded-3xl bg-black/[0.03] p-5 sm:p-6">
            <div class="flex items-center justify-between gap-4">
                <p class="text-[13px] font-medium text-neutral-500">Recommended</p>
                <p class="text-[13px] text-neutral-500">
                    {userOS === "windows" ? "Windows" : userOS === "mac" ? "macOS" : "Linux"}
                </p>
            </div>

            <div class="mt-3">
                {#if recommended}
                    <a
                        class="inline-flex h-11 items-center rounded-xl bg-black px-5 text-[13px] font-medium text-white hover:bg-black/90"
                        href={recommended.href}
                        download
                    >
                        {recommended.label}
                    </a>
                {:else}
                    <p class="text-[13px] text-neutral-500">Fetching latest release…</p>
                {/if}
            </div>

            <div class="mt-6 h-px bg-black/5"></div>

            <div class="mt-6 grid gap-6 sm:grid-cols-2">
                <div class="space-y-3">
                    <p class="text-[13px] font-medium text-neutral-500">Windows</p>
                    <div class="flex flex-wrap gap-2">
                        <a
                            href={downloadUrls.exe}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20 {!downloadUrls.exe && 'pointer-events-none opacity-40'}"
                        >
                            .exe
                        </a>
                        <a
                            href={downloadUrls.msi}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20 {!downloadUrls.msi && 'pointer-events-none opacity-40'}"
                        >
                            .msi
                        </a>
                    </div>
                </div>

                <div class="space-y-3">
                    <p class="text-[13px] font-medium text-neutral-500">Linux</p>
                    <div class="flex flex-wrap gap-2">
                        <a
                            href={downloadUrls.deb}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20 {!downloadUrls.deb && 'pointer-events-none opacity-40'}"
                        >
                            .deb
                        </a>
                        <a
                            href={downloadUrls.rpm}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20 {!downloadUrls.rpm && 'pointer-events-none opacity-40'}"
                        >
                            .rpm
                        </a>
                        <a
                            href={downloadUrls.appimage}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20 {!downloadUrls.appimage && 'pointer-events-none opacity-40'}"
                        >
                            .AppImage
                        </a>
                    </div>
                </div>

                <div class="space-y-3 sm:col-span-2">
                    <p class="text-[13px] font-medium text-neutral-500">macOS</p>
                    <div class="flex flex-wrap gap-2">
                        <a
                            href={downloadUrls.dmg}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20 {!downloadUrls.dmg && 'pointer-events-none opacity-40'}"
                        >
                            .dmg
                        </a>
                        <a
                            href={downloadUrls.macZip}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20 {!downloadUrls.macZip && 'pointer-events-none opacity-40'}"
                        >
                            .zip
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
