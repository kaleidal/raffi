<script lang="ts">
    import { fade } from "svelte/transition";
    import { onMount } from "svelte";
    
    const LATEST = "https://dl.schelf.store/kaleidal/raffi/latest";
    const downloadUrls = {
        exe: `${LATEST}/windows-x86_64/exe`,
        msi: `${LATEST}/windows-x86_64/msi`,
        deb: `${LATEST}/linux-x86_64/deb`,
        appimage: `${LATEST}/linux-x86_64/appimage`,
        rpm: `${LATEST}/linux-x86_64/rpm`,
        dmg: `${LATEST}/macos-universal/dmg`,
        macZip: `${LATEST}/macos-universal/zip`,
    };

    type UserOS = "windows" | "mac" | "linux";
    let userOS: UserOS = $state("windows");
    
    onMount(() => {
        const platform = navigator.platform.toLowerCase();
        const userAgent = navigator.userAgent.toLowerCase();
        
        if (platform.includes('mac') || userAgent.includes('mac')) {
            userOS = 'mac';
        } else if (platform.includes('linux') || userAgent.includes('linux')) {
            userOS = 'linux';
        } else if (platform.includes('win') || userAgent.includes('windows')) {
            userOS = 'windows';
        }
    });

    const RECOMMENDED: Record<UserOS, { label: string; href: string }> = {
        windows: { label: "Windows (.exe)", href: downloadUrls.exe },
        mac: { label: "macOS (.dmg)", href: downloadUrls.dmg },
        linux: { label: "Linux (.deb)", href: downloadUrls.deb },
    };

    const recommended = $derived(RECOMMENDED[userOS]);
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
            The app isn’t code‑signed, so Windows can show SmartScreen. That’s expected.
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
                <a
                    class="inline-flex h-11 items-center rounded-xl bg-black px-5 text-[13px] font-medium text-white hover:bg-black/90"
                    href={recommended.href}
                    download
                >
                    {recommended.label}
                </a>
            </div>

            <div class="mt-6 h-px bg-black/5"></div>

            <div class="mt-6 grid gap-6 sm:grid-cols-2">
                <div class="space-y-3">
                    <p class="text-[13px] font-medium text-neutral-500">Windows</p>
                    <div class="flex flex-wrap gap-2">
                        <a
                            href={downloadUrls.exe}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20"
                        >
                            .exe
                        </a>
                        <a
                            href={downloadUrls.msi}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20"
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
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20"
                        >
                            .deb
                        </a>
                        <a
                            href={downloadUrls.rpm}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20"
                        >
                            .rpm
                        </a>
                        <a
                            href={downloadUrls.appimage}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20"
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
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20"
                        >
                            .dmg
                        </a>
                        <a
                            href={downloadUrls.macZip}
                            download
                            class="inline-flex h-9 items-center rounded-xl px-4 text-[13px] ring-1 ring-black/10 hover:ring-black/20"
                        >
                            .zip
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
