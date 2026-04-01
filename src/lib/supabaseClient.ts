import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Temporary env debug (remove after verification)
console.info('[env-debug]', {
  hasViteSupabaseUrl: Boolean(supabaseUrl),
  hasViteSupabaseAnonKey: Boolean(supabaseAnonKey),
  sampleViteKeys: Object.keys(import.meta.env).filter((key) => key.startsWith('VITE_')),
})

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
