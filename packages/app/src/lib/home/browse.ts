import { writable } from "svelte/store";
import type { BrowseType } from "../library/browseCatalog";

export type BrowseSelection = { type: BrowseType; genre: string | null };

export const browseSelection = writable<BrowseSelection>({ type: "movie", genre: null });

export const BROWSE_SECTION_ID = "browse";
