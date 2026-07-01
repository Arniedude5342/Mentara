// Edge Function: send-meeting-invite
// Sends an HTML meeting invitation email to the mentor via Resend API.
// Accepts POST { meeting_id }
// Generates HMAC-SHA256 signed accept/decline links.

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

async function signToken(secret: string, meetingId: string, action: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${meetingId}:${action}`));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const PLATFORM_LABELS: Record<string, string> = {
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Microsoft Teams',
  facetime: 'FaceTime',
  other: 'Video Call',
};

function buildEmailHtml(params: {
  studentName: string;
  scheduledAt: string;
  platform: string;
  meetingLink: string | null;
  acceptUrl: string;
  declineUrl: string;
}): string {
  const { studentName, scheduledAt, platform, meetingLink, acceptUrl, declineUrl } = params;

  const platformLabel = PLATFORM_LABELS[platform] ?? 'Video Call';

  const dateFormatted = new Date(scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const linkRow = meetingLink
    ? `<tr><td style="padding: 4px 0; color: #666; font-size: 14px;">Meeting Link</td><td style="padding: 4px 0 4px 16px; font-size: 14px;"><a href="${meetingLink}" style="color: #0D4F5C; text-decoration: underline;">${meetingLink}</a></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Meeting Request — Mentara</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color: #0D4F5C; padding: 28px 36px 24px;">
              <p style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px;">Mentara</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 36px 28px;">
              <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1A1410; line-height: 1.3;">
                You have a new meeting request
              </h1>
              <p style="margin: 0 0 28px; font-size: 15px; color: #5C5248; line-height: 1.6;">
                <strong>${studentName}</strong> has scheduled a call with you on Mentara and is waiting for your confirmation.
              </p>

              <!-- Meeting details card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F5F2ED; border-radius: 8px; padding: 20px 24px; margin-bottom: 32px;">
                <tr>
                  <td>
                    <table cellpadding="0" cellspacing="0">
                      <tr><td style="padding: 4px 0; color: #666; font-size: 14px;">Student</td><td style="padding: 4px 0 4px 16px; font-size: 14px; font-weight: 600; color: #1A1410;">${studentName}</td></tr>
                      <tr><td style="padding: 4px 0; color: #666; font-size: 14px;">Date &amp; Time</td><td style="padding: 4px 0 4px 16px; font-size: 14px; font-weight: 600; color: #1A1410;">${dateFormatted}</td></tr>
                      <tr><td style="padding: 4px 0; color: #666; font-size: 14px;">Platform</td><td style="padding: 4px 0 4px 16px; font-size: 14px; font-weight: 600; color: #1A1410;">${platformLabel}</td></tr>
                      ${linkRow}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
                <tr>
                  <td style="padding-right: 8px; width: 50%;" align="center">
                    <a href="${acceptUrl}" style="display: block; background-color: #0D4F5C; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; text-align: center; padding: 14px 24px; border-radius: 8px;">
                      Accept Meeting
                    </a>
                  </td>
                  <td style="padding-left: 8px; width: 50%;" align="center">
                    <a href="${declineUrl}" style="display: block; background-color: #f5f5f5; color: #666666; text-decoration: none; font-size: 15px; font-weight: 600; text-align: center; padding: 14px 24px; border-radius: 8px; border: 1px solid #ddd;">
                      Decline
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; color: #8C8278; line-height: 1.6; text-align: center;">
                This link expires after use. If you have questions, reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; border-top: 1px solid #eee; padding: 20px 36px;">
              <p style="margin: 0; font-size: 12px; color: #aaa; text-align: center;">
                You're receiving this because a student scheduled a meeting with you on Mentara.<br />
                &copy; Mentara. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const inviteSecret = Deno.env.get('MEETING_INVITE_SECRET');

  // Verify caller is authenticated
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { meeting_id } = await req.json();

    if (!meeting_id) {
      return json({ error: 'Missing required field: meeting_id' }, 400);
    }

    // Fetch meeting record
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meeting_id)
      .single();

    if (meetingError || !meeting) {
      console.error('[send-meeting-invite] Meeting not found:', meetingError?.message);
      return json({ error: 'Meeting not found' }, 404);
    }

    // Verify caller is a participant — prevents sending invite emails for arbitrary meetings
    if (meeting.student_id !== user.id && meeting.mentor_id !== user.id) {
      return json({ error: 'Forbidden' }, 403);
    }

    // Deduplication: claim invite_sent_at atomically before sending.
    // If a prior invocation (or Supabase infra retry) already set it, skip.
    if (meeting.invite_sent_at) {
      console.log('[send-meeting-invite] Invite already sent for meeting:', meeting_id);
      return json({ sent: false, reason: 'already_sent' });
    }

    const { data: claimed, error: claimError } = await supabase
      .from('meetings')
      .update({ invite_sent_at: new Date().toISOString() })
      .eq('id', meeting_id)
      .is('invite_sent_at', null)
      .select('id')
      .single();

    if (claimError || !claimed) {
      // Another concurrent invocation already claimed it
      console.log('[send-meeting-invite] Invite claim lost (concurrent invocation) for:', meeting_id);
      return json({ sent: false, reason: 'already_sent' });
    }

    // Determine scheduler vs recipient based on scheduled_by (falls back to student scheduled)
    const scheduledBy = meeting.scheduled_by ?? meeting.student_id;
    const recipientId = scheduledBy === meeting.student_id ? meeting.mentor_id : meeting.student_id;
    const schedulerId = scheduledBy;

    // Fetch both profiles
    const [{ data: schedulerProfile }, { data: recipientProfile }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', schedulerId).single(),
      supabase.from('profiles').select('full_name').eq('id', recipientId).single(),
    ]);

    const schedulerName = schedulerProfile?.full_name ?? (scheduledBy === meeting.student_id ? 'Your student' : 'Your mentor');
    // Keep studentName alias for the email template below
    const studentName = schedulerName;

    // Fetch recipient's email via auth admin
    const { data: recipientAuthData, error: recipientAuthError } = await supabase.auth.admin.getUserById(recipientId);

    if (recipientAuthError || !recipientAuthData?.user?.email) {
      console.error('[send-meeting-invite] Could not retrieve recipient email:', recipientAuthError?.message);
      return json({ error: 'Could not retrieve recipient email' }, 500);
    }

    const mentorEmail = recipientAuthData.user.email;

    if (!resendApiKey) {
      console.warn('[send-meeting-invite] RESEND_API_KEY not set — skipping email send');
      return json({ sent: false, reason: 'RESEND_API_KEY not configured' });
    }

    if (!inviteSecret) {
      console.warn('[send-meeting-invite] MEETING_INVITE_SECRET not set — skipping email send');
      return json({ sent: false, reason: 'MEETING_INVITE_SECRET not configured' });
    }

    // Generate HMAC tokens
    const confirmToken = await signToken(inviteSecret, meeting_id, 'confirm');
    const declineToken = await signToken(inviteSecret, meeting_id, 'decline');

    const baseUrl = `${supabaseUrl}/functions/v1/respond-to-meeting-invite`;
    const acceptUrl = `${baseUrl}?meeting_id=${encodeURIComponent(meeting_id)}&action=confirm&token=${confirmToken}`;
    const declineUrl = `${baseUrl}?meeting_id=${encodeURIComponent(meeting_id)}&action=decline&token=${declineToken}`;

    const emailHtml = buildEmailHtml({
      studentName,
      scheduledAt: meeting.scheduled_at,
      platform: meeting.platform,
      meetingLink: meeting.meeting_link,
      acceptUrl,
      declineUrl,
    });

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Mentara <onboarding@resend.dev>',
        to: [mentorEmail],
        subject: `Meeting request from ${studentName} — Please confirm`,
        html: emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('[send-meeting-invite] Resend API error:', errText);
      return json({ sent: false, reason: 'Resend API returned an error' });
    }

    return json({ sent: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[send-meeting-invite] Unhandled error:', message);
    return json({ error: message }, 500);
  }
});
