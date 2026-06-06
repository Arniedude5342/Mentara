// Edge Function: respond-to-meeting-invite
// Handles mentor Accept/Decline clicks from meeting invitation emails.
// Validates HMAC token, updates meetings.invite_status, sends push to student,
// and returns an HTML confirmation page.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function signToken(secret: string, meetingId: string, action: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${meetingId}:${action}`));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function htmlPage(title: string, emoji: string, heading: string, body: string, emojiColor: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Mentara</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="min-height: 100vh; background-color: #f4f4f4; padding: 64px 16px;">
    <tr>
      <td align="center" valign="middle">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.10); text-align: center;">

          <!-- Logo bar -->
          <tr>
            <td style="background-color: #0D4F5C; padding: 22px 36px;">
              <p style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px;">Mentara</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 48px 36px 40px;">
              <p style="margin: 0 0 16px; font-size: 48px; line-height: 1;" aria-hidden="true">${emoji}</p>
              <h1 style="margin: 0 0 12px; font-size: 24px; font-weight: 700; color: #1A1410; line-height: 1.3;">${heading}</h1>
              <p style="margin: 0 0 32px; font-size: 15px; color: #5C5248; line-height: 1.6;">${body}</p>
              <p style="margin: 0; font-size: 13px; color: #aaa;">You can close this page.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; border-top: 1px solid #eee; padding: 16px 36px;">
              <p style="margin: 0; font-size: 12px; color: #bbb;">&copy; Mentara. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const inviteSecret = Deno.env.get('MEETING_INVITE_SECRET');

  const supabase = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  const meetingId = url.searchParams.get('meeting_id');
  const action = url.searchParams.get('action');
  const token = url.searchParams.get('token');

  // Validate required params
  if (!meetingId || !action || !token) {
    return htmlPage(
      'Invalid Link',
      '⚠️',
      'Invalid Link',
      'This link is missing required parameters. Please contact support if you believe this is an error.',
      '#C98B30',
    );
  }

  if (action !== 'confirm' && action !== 'decline') {
    return htmlPage(
      'Invalid Link',
      '⚠️',
      'Invalid Link',
      'This link is invalid or has already been used.',
      '#C98B30',
    );
  }

  if (!inviteSecret) {
    console.error('[respond-to-meeting-invite] MEETING_INVITE_SECRET not set');
    return htmlPage(
      'Error',
      '⚠️',
      'Something went wrong',
      'We could not process your response. Please try again later.',
      '#C98B30',
    );
  }

  // Validate HMAC token
  const expectedToken = await signToken(inviteSecret, meetingId, action);
  if (!safeEqual(token, expectedToken)) {
    return htmlPage(
      'Invalid Link',
      '⚠️',
      'Invalid Link',
      'This link is invalid or has already been used.',
      '#C98B30',
    );
  }

  // Fetch meeting to get participant IDs and who scheduled it
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('id, student_id, mentor_id, scheduled_by, invite_status')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    console.error('[respond-to-meeting-invite] Meeting not found:', meetingError?.message);
    return htmlPage(
      'Not Found',
      '⚠️',
      'Meeting Not Found',
      'This meeting no longer exists. It may have been cancelled.',
      '#C98B30',
    );
  }

  // Map action to invite_status value
  const newStatus = action === 'confirm' ? 'confirmed' : 'declined';

  // Idempotency check — if already responded, show an informational page instead of updating again
  if (meeting.invite_status !== 'pending') {
    const alreadyHeading = meeting.invite_status === 'confirmed' ? 'Already Confirmed' : 'Already Responded';
    const alreadyBody = meeting.invite_status === 'confirmed'
      ? 'You have already confirmed this meeting. Open the Mentara app to view details.'
      : 'You have already responded to this meeting invitation.';
    return htmlPage(alreadyHeading, 'ℹ️', alreadyHeading, alreadyBody, '#1D5FAB');
  }

  // Update invite_status
  const { error: updateError } = await supabase
    .from('meetings')
    .update({ invite_status: newStatus })
    .eq('id', meetingId);

  if (updateError) {
    console.error('[respond-to-meeting-invite] Failed to update invite_status:', updateError.message);
    return htmlPage(
      'Error',
      '⚠️',
      'Something went wrong',
      'We could not save your response. Please try again or contact support.',
      '#C98B30',
    );
  }

  // Fetch mentor's display name for the push notification
  const { data: mentorProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', meeting.mentor_id)
    .single();

  const mentorName = mentorProfile?.full_name ?? 'Your mentor';

  if (action === 'confirm') {
    // Confirmation email to both parties + push to scheduler — handled by send-meeting-confirmation
    fetch(`${supabaseUrl}/functions/v1/send-meeting-confirmation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ meeting_id: meetingId }),
    }).catch((err: unknown) => {
      console.warn('[respond-to-meeting-invite] Confirmation email failed (non-critical):', err);
    });
  } else {
    // Declined: push notification to whoever scheduled the meeting
    const schedulerId = meeting.scheduled_by ?? meeting.student_id;
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        user_id: schedulerId,
        title: 'Meeting Update',
        body: `${mentorName} has declined the meeting. Please reschedule in the app.`,
        data: { type: 'meeting_invite_response', meeting_id: meetingId, invite_status: newStatus },
      }),
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[respond-to-meeting-invite] Push notification failed (non-critical):', message);
    });
  }

  // Return HTML confirmation page
  if (action === 'confirm') {
    return htmlPage(
      'Meeting Confirmed',
      '✅',
      'Meeting Confirmed!',
      'Your meeting has been confirmed. Open the Mentara app to view details.',
      '#3D7A5B',
    );
  } else {
    return htmlPage(
      'Meeting Declined',
      '🟠',
      'Meeting Declined',
      'You have declined this meeting. The student will be notified to reschedule.',
      '#B8491A',
    );
  }
});
