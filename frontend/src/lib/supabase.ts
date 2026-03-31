import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If env vars are not set, supabase is null → open access mode (everyone gets in)
// Once VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are added to Vercel,
// the full email OTP flow activates automatically.
export const supabase = url && key ? createClient(url, key) : null;
