import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { authStorage } from './authStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Only the web build reads auth tokens out of the URL. A password-reset
    // recovery link lands on the web app at /reset-password with the recovery
    // token in the URL hash; detectSessionInUrl lets the client consume it and
    // emit a PASSWORD_RECOVERY event (handled in app/_layout.tsx). On native
    // there is no such URL to parse — reset is web-only — and leaving this on
    // there risks mis-handling the app's own deep links.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
