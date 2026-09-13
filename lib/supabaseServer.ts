import "server-only";
import { createClient } from "@supabase/supabase-js";

// This file must only ever be imported from API routes (app/api/**/route.ts)
// or other server-only code. The `server-only` import above makes Next.js
// throw a build error if it's ever accidentally imported into a client
// component, as a safety net against leaking the service role key.

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  // Thrown lazily (at request time) rather than at import time in most
  // serverless setups, but this makes the missing-env-var case obvious
  // instead of failing with a cryptic Supabase error.
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
}

export const supabaseServer = createClient(
  supabaseUrl ?? "",
  serviceRoleKey ?? "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);
