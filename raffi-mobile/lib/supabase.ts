import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bgthifmjlsgciechwvpm.supabase.co';
const supabaseAnonKey = 'sb_publishable_UZf0VuUiFWFDaJWHkHYkew_ux9PxOM2';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
