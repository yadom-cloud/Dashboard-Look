import { createClient } from '@supabase/supabase-js'

// These will automatically read from .env (local) or Vercel env vars (production)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or anon key missing – falling back to mock data')
}

export const supabase = createClient(
  supabaseUrl ?? 'https://dummy.supabase.co',
  supabaseAnonKey ?? 'dummy-key'
)
