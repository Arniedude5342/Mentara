// Edge Function: admin-stats
// Returns waitlist + mentor application + app profile counts.
// Protected by ADMIN_PASSWORD env var.
// Set it in: Supabase Dashboard > Project Settings > Edge Functions > Secrets

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const adminPassword = Deno.env.get('ADMIN_PASSWORD');
  if (!adminPassword) return json({ error: 'ADMIN_PASSWORD not set in Supabase secrets' }, 500);

  let body: { password?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  if (!body.password || body.password !== adminPassword) {
    return json({ error: 'Incorrect password' }, 401);
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const [wlRes, maRes, profilesRes] = await Promise.all([
    sb.from('waitlist')
      .select('email, source, created_at')
      .order('created_at', { ascending: false }),
    sb.from('mentor_applications')
      .select('id, name, email, expertise, experience, linkedin, source, created_at')
      .order('created_at', { ascending: false }),
    sb.from('profiles').select('role'),
  ]);

  const profiles = profilesRes.data ?? [];

  return json({
    waitlist:    wlRes.data ?? [],
    mentorApps:  maRes.data ?? [],
    appMentors:  profiles.filter((p: { role: string }) => p.role === 'mentor').length,
    appStudents: profiles.filter((p: { role: string }) => p.role === 'student').length,
  });
});
