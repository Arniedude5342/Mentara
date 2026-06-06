import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/push.ts';

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function verifyToken(secret: string, payload: string, token: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  let tokenBytes: Uint8Array;
  try {
    tokenBytes = Uint8Array.from(atob(token), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  return crypto.subtle.verify('HMAC', key, tokenBytes, new TextEncoder().encode(payload));
}

const PAGE = (title: string, icon: string, color: string, message: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px;">
  <div style="text-align:center;max-width:400px;">
    <div style="font-size:56px;margin-bottom:16px;">${icon}</div>
    <h1 style="color:${color};font-size:22px;margin:0 0 12px;">${title}</h1>
    <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0;">${message}</p>
  </div>
</body>
</html>`;

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const secret = Deno.env.get('MEETING_INVITE_SECRET')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  const mentorId = url.searchParams.get('mentor_id');
  const action = url.searchParams.get('action');
  const token = url.searchParams.get('token');
  const expiresParam = url.searchParams.get('expires');

  if (!mentorId || !action || !token) {
    return html(PAGE('Invalid Link', '🔗', '#dc2626', 'This verification link is missing required parameters.'), 400);
  }
  if (action !== 'approve' && action !== 'reject') {
    return html(PAGE('Invalid Action', '⚠️', '#dc2626', 'Unknown action. Expected "approve" or "reject".'), 400);
  }

  // Check expiry if present (links generated before token expiry was added have no expires param)
  if (expiresParam) {
    const expiresAt = parseInt(expiresParam, 10);
    if (isNaN(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) {
      return html(PAGE('Link Expired', '⏰', '#dc2626', 'This verification link has expired. Please contact Mentara support to re-send the verification email.'), 410);
    }
  }

  const payload = expiresParam ? `${mentorId}:${action}:${expiresParam}` : `${mentorId}:${action}`;
  const valid = await verifyToken(secret, payload, token);
  if (!valid) {
    return html(PAGE('Invalid Link', '🔒', '#dc2626', 'This link is invalid or has already been used.'), 403);
  }

  // Check current state — prevent re-processing
  const { data: mp } = await supabase
    .from('mentor_profiles')
    .select('verification_status, verified')
    .eq('id', mentorId)
    .single();

  if (!mp) {
    return html(PAGE('Not Found', '🔍', '#dc2626', 'Mentor profile not found.'), 404);
  }

  if (mp.verification_status !== 'pending') {
    const label = mp.verification_status === 'verified' ? 'already approved' : 'already rejected';
    return html(PAGE('Already Processed', 'ℹ️', '#6b7280', `This mentor has been ${label}.`));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', mentorId)
    .single();
  const mentorName = profile?.full_name ?? 'the mentor';

  if (action === 'approve') {
    await supabase
      .from('mentor_profiles')
      .update({ verified: true, verification_status: 'verified' })
      .eq('id', mentorId);

    await sendPushToUser(
      supabase,
      mentorId,
      'Profile approved! 🎉',
      "You're now verified on Mentara. We'll match you with a student soon!",
      { type: 'mentor_verified' },
    );

    // Now that this mentor is verified, attempt to match waiting students
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
    supabase.functions.invoke('match-waiting-students', {
      headers: { Authorization: `Bearer ${internalSecret}` },
      body: { mentorId },
    }).catch((err: any) => console.error('[verify-mentor] match-waiting-students failed:', err));

    return html(PAGE(
      'Mentor Approved',
      '✅',
      '#0D4F5C',
      `${mentorName}'s profile has been approved. They've been notified and will be matched with a student shortly.`,
    ));
  } else {
    await supabase
      .from('mentor_profiles')
      .update({ verified: false, verification_status: 'rejected' })
      .eq('id', mentorId);

    await sendPushToUser(
      supabase,
      mentorId,
      'Profile review update',
      "We weren't able to verify your profile at this time. Please update your information and contact support.",
      { type: 'mentor_rejected' },
    );

    return html(PAGE(
      'Mentor Rejected',
      '❌',
      '#dc2626',
      `${mentorName}'s application has been rejected. They've been notified.`,
    ));
  }
});
