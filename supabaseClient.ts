import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pgpoxuknldfcbzetuvyt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBncG94dWtubGRmY2J6ZXR1dnl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0Nzk3OTIsImV4cCI6MjA4MDA1NTc5Mn0.cyyBauP23ptYFtiCT2Qdiz7K2ZE3NmlbG9mo1llE4gg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);