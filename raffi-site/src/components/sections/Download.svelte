<script lang="ts">
    import { fly } from 'svelte/transition';
    import { onMount } from 'svelte';
    
    let downloadUrls = {
        exe: '',
        msi: '',
        deb: '',
        appimage: '',
        rpm: '',
        dmg: '',
        macZip: ''
    };
    
    let userOS = 'windows';
    
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
            const release = await response.json();
            
            release.assets.forEach((asset: any) => {
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
</script>

<div in:fly={{ y: 50, duration: 500 }} class="flex flex-col gap-10 text-black max-w-2xl w-full px-4">
    <h2 class="text-5xl font-bold text-black transform -rotate-2">Download Raffi</h2>
    
    <!-- Windows -->
    <div class="flex flex-col gap-4 p-6 bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl">
        <div class="flex items-center gap-3">
            <span class="text-2xl text-black font-bold">Windows</span>
            {#if userOS === 'windows'}
                <span class="text-sm bg-blue-100 text-blue-800 border border-blue-800 px-2 py-0.5 rounded font-bold transform -rotate-2">Recommended</span>
            {/if}
        </div>
        <div class="flex gap-4">
            <a 
                href={downloadUrls.exe} 
                class="px-6 py-3 bg-black text-white font-bold rounded-lg border-2 border-black hover:bg-white hover:text-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all {!downloadUrls.exe && 'opacity-50 pointer-events-none'}"
                download
            >
                Download .exe
            </a>
            <a 
                href={downloadUrls.msi} 
                class="px-6 py-3 bg-white text-black font-bold rounded-lg border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all {!downloadUrls.msi && 'opacity-50 pointer-events-none'}"
                download
            >
                Download .msi
            </a>
        </div>
        <p class="text-sm font-medium bg-yellow-100 p-2 border border-yellow-400 rounded text-yellow-900 mt-2">
            ⚠️ Note: The app is not code-signed (certificates are expensive). You may see a SmartScreen warning. It's safe to proceed.
        </p>
    </div>

    <!-- Linux -->
    <div class="flex flex-col gap-4 p-6 bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl">
        <div class="flex items-center gap-3">
            <span class="text-2xl text-black font-bold">Linux</span>
            {#if userOS === 'linux'}
                <span class="text-sm bg-blue-100 text-blue-800 border border-blue-800 px-2 py-0.5 rounded font-bold transform -rotate-2">Recommended</span>
            {/if}
        </div>
        <div class="flex flex-wrap gap-4">
            <a 
                href={downloadUrls.deb} 
                class="px-6 py-3 bg-white text-black font-bold rounded-lg border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all {!downloadUrls.deb && 'opacity-50 pointer-events-none'}"
                download
            >
                .deb
            </a>
            <a 
                href={downloadUrls.rpm} 
                class="px-6 py-3 bg-white text-black font-bold rounded-lg border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all {!downloadUrls.rpm && 'opacity-50 pointer-events-none'}"
                download
            >
                .rpm
            </a>
            <a 
                href={downloadUrls.appimage} 
                class="px-6 py-3 bg-white text-black font-bold rounded-lg border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all {!downloadUrls.appimage && 'opacity-50 pointer-events-none'}"
                download
            >
                .AppImage
            </a>
        </div>
    </div>

    <!-- macOS -->
    <div class="flex flex-col gap-4 p-6 bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl">
        <div class="flex items-center gap-3">
            <span class="text-2xl text-black font-bold">macOS</span>
            {#if userOS === 'mac'}
                <span class="text-sm bg-blue-100 text-blue-800 border border-blue-800 px-2 py-0.5 rounded font-bold transform -rotate-2">Recommended</span>
            {/if}
        </div>
        <div class="flex flex-wrap gap-4">
            <a 
                href={downloadUrls.dmg} 
                class="px-6 py-3 bg-white text-black font-bold rounded-lg border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all {!downloadUrls.dmg && 'opacity-50 pointer-events-none'}"
                download
            >
                .dmg
            </a>
            <a 
                href={downloadUrls.macZip} 
                class="px-6 py-3 bg-white text-black font-bold rounded-lg border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all {!downloadUrls.macZip && 'opacity-50 pointer-events-none'}"
                download
            >
                .zip
            </a>
        </div>
    </div>
</div>
