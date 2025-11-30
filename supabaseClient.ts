import { createClient } from '@supabase/supabase-js'

// Debug: Log env vars (visible in browser Console)
console.log('Supabase URL from env:', import.meta.env.VITE_SUPABASE_URL ? 'SET' : 'MISSING');
console.log('Supabase Anon Key from env:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'SET' : 'MISSING');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('🚨 SUPABASE ENV VARS MISSING - Using mock mode');
  // Don't crash - export a dummy client
  export const supabase = {
    from: () => ({
      select: () => ({ data: null, error: { message: 'Mock mode - add env vars' } })
    })
  } as any;
  // Also trigger mock in App
  window.USE_MOCK_DATA = true;
} else {
  export const supabase = createClient(supabaseUrl, supabaseAnonKey);
}
