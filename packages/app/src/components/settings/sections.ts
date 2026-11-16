import { Blocks, FolderOpen, Info, Palette, Play, Radio, Tv, UserRound } from "@lucide/svelte";
import type { SettingsSection } from "../../lib/stores/settings";

export type SectionEntry = {
    id: SettingsSection;
    label: string;
    icon: typeof Blocks;
};

export const SECTIONS: SectionEntry[] = [
    { id: "account", label: "Account", icon: UserRound },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "playback", label: "Playback", icon: Play },
    { id: "streaming", label: "Streaming", icon: Radio },
    { id: "addons", label: "Addons", icon: Blocks },
    { id: "live", label: "Live TV", icon: Tv },
    { id: "library", label: "Local files", icon: FolderOpen },
    { id: "about", label: "About", icon: Info },
];
