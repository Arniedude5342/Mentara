import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/push.ts';

// Internal-only function — no CORS headers, no public access.
// Callers must pass Authorization: Bearer <INTERNAL_FUNCTION_SECRET>.

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  // Enforce internal-caller authentication before touching any data.
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!internalSecret || authHeader !== `Bearer ${internalSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey = Deno.env.get('GOOGLE_API_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { mentorId } = await req.json();
    if (!mentorId) return json({ error: 'Missing mentorId' }, 400);

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

    if (!mp || !profile) return json({ error: 'Mentor not found' }, 404);
    if (mp.verification_status !== 'pending') return json({ skipped: true, status: mp.verification_status });

    const prompt = `You are a background check system for a student mentorship platform. Assess whether this mentor profile looks legitimate.

Profile:
- Name: ${profile.full_name ?? 'Not provided'}
- Title: ${mp.title ?? 'Not provided'}
- Institution / Company: ${mp.institution ?? 'Not provided'}
- Years of experience: ${mp.years_experience ?? 0}
- Fields of expertise: ${(mp.fields_of_expertise as string[] ?? []).join(', ') || 'Not provided'}
- Location: ${profile.location ?? 'Not provided'}
- LinkedIn URL: ${mp.linkedin_url ?? 'Not provided'}
- Bio: ${profile.bio ?? 'Not provided'}
- Mentoring style: ${mp.mentoring_style ?? 'Not provided'}

Rules:
1. Reject if: bio or title is gibberish, placeholder text, or clearly fake.
2. Reject if: years_experience is implausibly high for the claimed title (e.g. 40+ years as a "Junior Developer").
3. Reject if: fields of expertise are completely unrelated to the claimed title/institution with no plausible explanation.
4. Reject if: LinkedIn URL is clearly fake (e.g. "https://linkedin.com/in/aaaaaaa" or random characters).
5. Approve if the profile is internally consistent and plausible, even if sparse.

Be lenient — most legitimate mentors won't write long bios. Only reject clear red flags.

Return ONLY valid JSON:
{"approve": true|false, "reason": "<one sentence>"}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 128 },
        }),
      },
    );

    // null = AI unavailable → leave as pending for manual review (safe default)
    let approve: boolean | null = null;
    let reason = 'AI unavailable — queued for manual review';

    if (geminiRes.ok) {
      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch?.[0] ?? rawText);
        if (typeof parsed.approve === 'boolean') {
          approve = parsed.approve;
          reason = parsed.reason ?? reason;
        }
      } catch {
        console.error('[auto-verify-mentor] Failed to parse Gemini response:', rawText);
      }
    } else {
      console.error('[auto-verify-mentor] Gemini error:', await geminiRes.text());
    }

    // AI unavailable — leave verification_status as 'pending' for manual admin review
    if (approve === null) {
      console.error('[auto-verify-mentor] AI unavailable for mentor', mentorId, '— leaving as pending');
      return json({ approved: null, reason });
    }

    if (approve === true) {
      await supabase
        .from('mentor_profiles')
        .update({ verified: true, verification_status: 'verified' })
        .eq('id', mentorId);

      await sendPushToUser(
        supabase,
        mentorId,
        'Profile approved! 🎉',
        "You're verified on Mentara. We'll match you with a student soon!",
        { type: 'mentor_verified' },
      );

      // Match any students already waiting
      const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
      supabase.functions.invoke('match-waiting-students', {
        headers: { Authorization: `Bearer ${internalSecret}` },
        body: { mentorId },
      }).catch((err: any) => console.error('[auto-verify-mentor] match-waiting-students failed:', err));

      return json({ approved: true, reason });
    } else {
      await supabase
        .from('mentor_profiles')
        .update({ verified: false, verification_status: 'rejected' })
        .eq('id', mentorId);

      await sendPushToUser(
        supabase,
        mentorId,
        'Profile needs attention',
        'We had trouble verifying your profile. Please review your information or contact mentarasupport@gmail.com.',
        { type: 'mentor_rejected' },
      );

      // Email admin with full credentials for manual back-checking
      const { data: authUser } = await supabase.auth.admin.getUserById(mentorId);
      const mentorEmail = authUser?.user?.email ?? 'unknown';
      const fields = (mp.fields_of_expertise as string[] ?? []).join(', ') || 'Not specified';

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:32px 16px;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#dc2626;padding:28px 32px;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">⚠️ Flagged Mentor Profile</h1>
      <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:14px;">AI flagged this profile as potentially fake. Manual back-check recommended.</p>
    </div>
    <div style="padding:20px 32px 8px;background:#fef2f2;border-bottom:1px solid #fecaca;">
      <p style="margin:0;font-size:13px;color:#991b1b;"><strong>AI rejection reason:</strong> ${reason}</p>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:140px;">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(profile.full_name ?? '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Email</td><td style="padding:8px 0;font-size:14px;color:#111827;">${escapeHtml(mentorEmail)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Title</td><td style="padding:8px 0;font-size:14px;color:#111827;">${escapeHtml(mp.title ?? '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Institution</td><td style="padding:8px 0;font-size:14px;color:#111827;">${escapeHtml(mp.institution ?? '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Experience</td><td style="padding:8px 0;font-size:14px;color:#111827;">${mp.years_experience ?? 0} years</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Location</td><td style="padding:8px 0;font-size:14px;color:#111827;">${escapeHtml(profile.location ?? '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Fields</td><td style="padding:8px 0;font-size:14px;color:#111827;">${escapeHtml(fields)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">LinkedIn</td><td style="padding:8px 0;font-size:14px;"><a href="${escapeHtml(mp.linkedin_url ?? '#')}" style="color:#dc2626;">${escapeHtml(mp.linkedin_url ?? '—')}</a></td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Mentor ID</td><td style="padding:8px 0;font-size:12px;color:#6b7280;font-family:monospace;">${mentorId}</td></tr>
      </table>
      ${profile.bio ? `<div style="margin-top:16px;padding:14px;background:#f9fafb;border-radius:8px;"><p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Bio</p><p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${escapeHtml(profile.bio)}</p></div>` : ''}
      ${mp.mentoring_style ? `<div style="margin-top:12px;padding:14px;background:#f9fafb;border-radius:8px;"><p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Mentoring Style</p><p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${escapeHtml(mp.mentoring_style)}</p></div>` : ''}
    </div>
    <div style="padding:16px 32px 24px;">
      <p style="margin:0 0 12px;font-size:13px;color:#374151;">If this person is legitimate, manually approve them by running this SQL in Supabase:</p>
      <pre style="background:#1e293b;color:#94a3b8;padding:14px;border-radius:8px;font-size:12px;overflow-x:auto;margin:0;">UPDATE mentor_profiles SET verified = true, verification_status = 'verified' WHERE id = '${mentorId}';</pre>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f3f4f6;background:#fafafa;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">Mentara auto-verification system</p>
    </div>
  </div>
</body>
</html>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Mentara <noreply@mentarasupport.com>',
          to: 'reacharnavmalhotra@gmail.com',
          subject: `⚠️ Flagged mentor: ${profile.full_name ?? 'Unknown'} — manual review needed`,
          html,
        }),
      }).catch((err: any) => console.error('[auto-verify-mentor] Failed to send rejection email:', err));

      return json({ approved: false, reason });
    }
  } catch (err: any) {
    console.error('[auto-verify-mentor] Error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
