// Edge Function: send-meeting-confirmation
// Sends a "Your meeting is confirmed!" email to both student and mentor.
// Also pushes a notification to whoever scheduled the meeting.
// Called from respond-to-meeting-invite (after email link accept) and
// from the in-app accept flow (respondToMeetingInviteInApp).
// POST { meeting_id }

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

const PLATFORM_LABELS: Record<string, string> = {
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Microsoft Teams',
  facetime: 'FaceTime',
  other: 'Video Call',
};

function buildConfirmationEmail(params: {
  recipientName: string;
  otherPartyName: string;
  scheduledAt: string;
  platform: string;
  meetingLink: string | null;
}): string {
  const { recipientName, otherPartyName, scheduledAt, platform, meetingLink } = params;
  const platformLabel = PLATFORM_LABELS[platform] ?? 'Video Call';
  const dateFormatted = new Date(scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const linkRow = meetingLink
    ? `<tr><td style="padding:4px 0;color:#666;font-size:14px;">Meeting Link</td><td style="padding:4px 0 4px 16px;font-size:14px;"><a href="${meetingLink}" style="color:#0D4F5C;text-decoration:underline;">${meetingLink}</a></td></tr>`
    : '';
  const addToCalRow = meetingLink
    ? `<p style="margin:0 0 16px;font-size:13px;color:#8C8278;text-align:center;">You can also add this to your calendar directly from the Mentara app.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Confirmed — Mentara</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
      <tr><td style="background-color:#0D4F5C;padding:28px 36px 24px;">
        <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">Mentara</p>
      </td></tr>
      <tr><td style="padding:36px 36px 28px;">
        <p style="margin:0 0 8px;font-size:36px;text-align:center;">✅</p>
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1410;text-align:center;line-height:1.3;">
          Your meeting is confirmed!
        </h1>
        <p style="margin:0 0 28px;font-size:15px;color:#5C5248;line-height:1.6;text-align:center;">
          Hi ${recipientName} — your call with <strong>${otherPartyName}</strong> is all set.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F2ED;border-radius:8px;padding:20px 24px;margin-bottom:28px;">
          <tr><td>
            <table cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;color:#666;font-size:14px;">With</td><td style="padding:4px 0 4px 16px;font-size:14px;font-weight:600;color:#1A1410;">${otherPartyName}</td></tr>
              <tr><td style="padding:4px 0;color:#666;font-size:14px;">Date &amp; Time</td><td style="padding:4px 0 4px 16px;font-size:14px;font-weight:600;color:#1A1410;">${dateFormatted}</td></tr>
              <tr><td style="padding:4px 0;color:#666;font-size:14px;">Platform</td><td style="padding:4px 0 4px 16px;font-size:14px;font-weight:600;color:#1A1410;">${platformLabel}</td></tr>
              ${linkRow}
            </table>
          </td></tr>
        </table>
        ${addToCalRow}
        <p style="margin:0;font-size:13px;color:#8C8278;line-height:1.6;text-align:center;">
          Open the Mentara app to view full details, add notes, or reschedule.
        </p>
      </td></tr>
      <tr><td style="background-color:#f9f9f9;border-top:1px solid #eee;padding:20px 36px;">
        <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">
          &copy; Mentara. All rights reserved.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  const supabase = createClient(supabaseUrl, serviceKey);

  // Accept either a service-role call (from another edge function) or an authenticated participant call
  const authHeader = req.headers.get('Authorization') ?? '';
  const isServiceCall = authHeader === `Bearer ${serviceKey}`;

  let callerUserId: string | null = null;
  if (!isServiceCall) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return json({ error: 'Unauthorized' }, 401);
    callerUserId = user.id;
  }

  try {
    const { meeting_id } = await req.json();
    if (!meeting_id) return json({ error: 'Missing meeting_id' }, 400);

    // Fetch meeting
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meeting_id)
      .single();

    if (meetingError || !meeting) return json({ error: 'Meeting not found' }, 404);

    // Verify participant if not a service call
    if (callerUserId && meeting.student_id !== callerUserId && meeting.mentor_id !== callerUserId) {
      return json({ error: 'Forbidden' }, 403);
    }

    // Deduplication: atomically claim confirmation_sent_at
    if (meeting.confirmation_sent_at) {
      return json({ sent: false, reason: 'already_sent' });
    }

    const { data: claimed, error: claimError } = await supabase
      .from('meetings')
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq('id', meeting_id)
      .is('confirmation_sent_at', null)
      .select('id')
      .single();

    if (claimError || !claimed) {
      return json({ sent: false, reason: 'already_sent' });
    }

    // Fetch both profiles
    const [{ data: studentProfile }, { data: mentorProfile }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', meeting.student_id).single(),
      supabase.from('profiles').select('full_name').eq('id', meeting.mentor_id).single(),
    ]);

    const studentName = studentProfile?.full_name ?? 'Student';
    const mentorName = mentorProfile?.full_name ?? 'Mentor';

    // Fetch emails via auth admin
    const [{ data: studentAuth }, { data: mentorAuth }] = await Promise.all([
      supabase.auth.admin.getUserById(meeting.student_id),
      supabase.auth.admin.getUserById(meeting.mentor_id),
    ]);

    const studentEmail = studentAuth?.user?.email;
    const mentorEmail = mentorAuth?.user?.email;

    if (!resendApiKey) {
      console.warn('[send-meeting-confirmation] RESEND_API_KEY not set — skipping');
      return json({ sent: false, reason: 'RESEND_API_KEY not configured' });
    }

    // Send confirmation emails to both parties
    const emailPayloads = [
      ...(studentEmail ? [{
        to: studentEmail,
        recipientName: studentName,
        otherPartyName: mentorName,
      }] : []),
      ...(mentorEmail ? [{
        to: mentorEmail,
        recipientName: mentorName,
        otherPartyName: studentName,
      }] : []),
    ];

    await Promise.allSettled(emailPayloads.map(({ to, recipientName, otherPartyName }) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Mentara <onboarding@resend.dev>',
          to: [to],
          subject: `Your Mentara call is confirmed — ${new Date(meeting.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          html: buildConfirmationEmail({
            recipientName,
            otherPartyName,
            scheduledAt: meeting.scheduled_at,
            platform: meeting.platform,
            meetingLink: meeting.meeting_link,
          }),
        }),
      })
    ));

    // Push notification to whoever scheduled the meeting (they get confirmation)
    const schedulerId = meeting.scheduled_by ?? meeting.student_id;
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        user_id: schedulerId,
        title: 'Meeting Confirmed! 🎉',
        body: `Your call with ${schedulerId === meeting.student_id ? mentorName : studentName} has been confirmed.`,
        data: { type: 'meeting_confirmed', meeting_id },
      }),
    }).catch(() => {});

    return json({ sent: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[send-meeting-confirmation] Unhandled error:', message);
    return json({ error: message }, 500);
  }
});
