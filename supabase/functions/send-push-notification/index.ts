// Edge Function: send-push-notification
// Sends an Expo push notification to a user by user_id.
// Accepts POST { user_id, title, body, data? }
// Handles DeviceNotRegistered by deleting stale tokens.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { user_id, title, body, data } = await req.json();

    if (!user_id || !title || !body) {
      return json({ error: 'Missing required fields: user_id, title, body' }, 400);
    }

    // Look up the user's push token
    const { data: tokenRow, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', user_id)
      .maybeSingle();

    if (tokenError) {
      console.error('[send-push-notification] Token lookup error:', tokenError.message);
      return json({ error: 'Failed to look up push token' }, 500);
    }

    if (!tokenRow?.token) {
      // User has no registered token — not an error, just nothing to do
      return json({ sent: false, reason: 'No push token registered for user' });
    }

    // Send via Expo Push API
    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: tokenRow.token,
        title,
        body,
        data: data ?? {},
        sound: 'default',
        priority: 'high',
      }),
    });

    if (!expoRes.ok) {
      const errText = await expoRes.text();
      console.error('[send-push-notification] Expo API error:', errText);
      return json({ error: 'Expo push API returned an error', sent: false }, 502);
    }

    const result = await expoRes.json();

    // Handle DeviceNotRegistered — the token is stale (app uninstalled / reinstalled)
    if (result.data?.status === 'error' && result.data?.details?.error === 'DeviceNotRegistered') {
      console.warn('[send-push-notification] DeviceNotRegistered — removing stale token:', tokenRow.token);
      await supabase.from('push_tokens').delete().eq('token', tokenRow.token);
      return json({ sent: false, reason: 'DeviceNotRegistered — stale token removed' });
    }

    return json({ sent: true });
  } catch (err: any) {
    console.error('[send-push-notification] Unhandled error:', err);
    return json({ error: err.message ?? 'Internal server error' }, 500);
  }
});
