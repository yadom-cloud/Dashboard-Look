// src/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Critical: if env vars are missing → don't crash the whole app
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or anon key is missing!')
  console.log('Check Vercel Environment Variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

// Create client with fallbacks so app never crashes
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)
