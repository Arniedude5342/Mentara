import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Internal-only — callers must pass Authorization: Bearer <INTERNAL_FUNCTION_SECRET>.

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function signToken(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

Deno.serve(async (req: Request) => {
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const validBearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const isAuthorized =
    (internalSecret && validBearer === internalSecret) ||
    (serviceKey && validBearer === serviceKey);
  if (!isAuthorized) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const resendKey = Deno.env.get('RESEND_API_KEY')!;
  const secret = Deno.env.get('MEETING_INVITE_SECRET')!;
  const adminEmail = 'reacharnavmalhotra@gmail.com';
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { mentorId } = await req.json();
    if (!mentorId) return json({ error: 'Missing mentorId' }, 400);

    // Fetch mentor profile + auth email
    const { data: mp } = await supabase
      .from('mentor_profiles')
      .select('title, institution, fields_of_expertise, years_experience, linkedin_url, mentoring_style, verification_status')
      .eq('id', mentorId)
      .single();

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, bio, location')
      .eq('id', mentorId)
      .single();

    const { data: authUser } = await supabase.auth.admin.getUserById(mentorId);
    const mentorEmail = authUser?.user?.email ?? 'unknown';

    if (!mp || !profile) return json({ error: 'Mentor not found' }, 404);

    // Only notify if still pending
    if (mp.verification_status !== 'pending') return json({ skipped: true });

    const baseUrl = `${supabaseUrl}/functions/v1/verify-mentor`;
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // 7 days
    const approveToken = await signToken(secret, `${mentorId}:approve:${expiresAt}`);
    const rejectToken  = await signToken(secret, `${mentorId}:reject:${expiresAt}`);

    const approveUrl = `${baseUrl}?mentor_id=${mentorId}&action=approve&expires=${expiresAt}&token=${encodeURIComponent(approveToken)}`;
    const rejectUrl  = `${baseUrl}?mentor_id=${mentorId}&action=reject&expires=${expiresAt}&token=${encodeURIComponent(rejectToken)}`;

    const fields = (mp.fields_of_expertise as string[] ?? []).join(', ') || 'Not specified';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:32px 16px;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#0D4F5C;padding:28px 32px;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">New Mentor Application</h1>
      <p style="color:rgba(255,255,255,.75);margin:6px 0 0;font-size:14px;">Review and approve before they're matched with students</p>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:140px;">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;">${profile.full_name ?? '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Email</td><td style="padding:8px 0;font-size:14px;color:#111827;">${mentorEmail}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Title</td><td style="padding:8px 0;font-size:14px;color:#111827;">${mp.title ?? '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Institution</td><td style="padding:8px 0;font-size:14px;color:#111827;">${mp.institution ?? '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Experience</td><td style="padding:8px 0;font-size:14px;color:#111827;">${mp.years_experience ?? 0} years</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Location</td><td style="padding:8px 0;font-size:14px;color:#111827;">${profile.location ?? '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Fields</td><td style="padding:8px 0;font-size:14px;color:#111827;">${fields}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">LinkedIn</td><td style="padding:8px 0;font-size:14px;"><a href="${mp.linkedin_url ?? '#'}" style="color:#0D4F5C;">${mp.linkedin_url ?? '—'}</a></td></tr>
      </table>
      ${profile.bio ? `<div style="margin-top:16px;padding:14px;background:#f9fafb;border-radius:8px;"><p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${profile.bio}</p></div>` : ''}
      ${mp.mentoring_style ? `<div style="margin-top:12px;padding:14px;background:#f0fdf4;border-radius:8px;"><p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:.05em;">Mentoring Style</p><p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${mp.mentoring_style}</p></div>` : ''}
    </div>
    <div style="padding:0 32px 32px;display:flex;gap:12px;">
      <a href="${approveUrl}" style="display:inline-block;background:#0D4F5C;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;margin-right:12px;">✓ Approve Mentor</a>
      <a href="${rejectUrl}" style="display:inline-block;background:#ffffff;color:#dc2626;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;border:1.5px solid #dc2626;">✗ Reject</a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f3f4f6;background:#fafafa;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">These links are single-use and HMAC-signed. Mentara admin panel.</p>
    </div>
  </div>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Mentara <noreply@mentarasupport.com>',
        to: adminEmail,
        subject: `New mentor application: ${profile.full_name ?? 'Unknown'}`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('[notify-admin-new-mentor] Resend error:', errText);
      return json({ error: 'Failed to send admin notification' }, 500);
    }

    return json({ sent: true });
  } catch (err: any) {
    console.error('[notify-admin-new-mentor] Error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
