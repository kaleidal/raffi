import type { List, ListItem } from "../../lib/db/db";

export type { List, ListItem };

export interface ExtendedListItem extends ListItem {
    name?: string;
    description?: string;
    year?: string;
    runtime?: string;
    imdbRating?: string;
    logo?: string;
    background?: string;
    trailerStreams?: any[];
    videos?: any[];
    _partial?: boolean;
    db_item?: any;
}

export interface DragState {
    draggedItem: ExtendedListItem | null;
    draggedFromListId: string | null;
}

export interface PlayerState {
    isPaused: boolean;
    isMuted: boolean;
    playerIframe: HTMLIFrameElement | null;
}

export interface EditingState {
    listId: string | null;
    name: string;
}
