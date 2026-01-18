import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    'https://bgthifmjlsgciechwvpm.supabase.co',
    'sb_publishable_UZf0VuUiFWFDaJWHkHYkew_ux9PxOM2',
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storage: localStorage,
            storageKey: 'raffi_auth_token',
        },
    }
);