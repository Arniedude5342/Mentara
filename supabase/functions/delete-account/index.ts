import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase Edge Function: delete-account
// Called by authenticated users who want to permanently delete their account.
// Uses the service role key (server-side only, never exposed to the client) to
// call auth.admin.deleteUser(), which cascades to all profile data via DB triggers.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://mentara.me',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Server misconfiguration — missing environment variables' }, 500);
  }

  // Verify the caller's identity using their own JWT
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Use service role to permanently delete the auth user.
  // ON DELETE CASCADE in schema.sql propagates to profiles, conversations, messages, etc.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return json({ error: deleteError.message }, 500);
  }

  return json({ success: true });
});
