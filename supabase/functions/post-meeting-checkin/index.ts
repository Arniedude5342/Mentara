// Edge Function: post-meeting-checkin
// Internal-only — triggered by Supabase cron every 15 minutes.
// Requires a valid Supabase service_role JWT in Authorization header.

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function decodeJwtRole(bearer: string): string {
  try {
    const payload = bearer.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.role === 'string' ? decoded.role : '';
  } catch {
    return '';
  }
}

async function sendPushToUser(
  supabase: any,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const { data: tokenRow } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId)
    .maybeSingle();

  if (!tokenRow?.token) return;

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
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

  const result = await res.json();

  if (result.data?.status === 'DeviceNotRegistered') {
    await supabase.from('push_tokens').delete().eq('token', tokenRow.token);
  }
}

Deno.serve(async (req: Request) => {
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const validBearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  // Supabase gateway verifies JWT signature before reaching this function,
  // so checking the decoded role claim is sufficient.
  const isAuthorized =
    decodeJwtRole(validBearer) === 'service_role' ||
    (internalSecret !== '' && validBearer === internalSecret);
  if (!isAuthorized) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // Use env var if available, otherwise use the authenticated bearer from the request.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || validBearer;

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Find meetings that ended 15+ min ago with no check-in message yet.
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: pendingMeetings, error } = await supabase
      .from('meetings')
      .select(`
        id,
        conversation_id,
        student_id,
        mentor_id,
        is_first_meeting,
        student:profiles!student_id(full_name),
        mentor:profiles!mentor_id(full_name)
      `)
      .lt('scheduled_at', fifteenMinAgo)
      .is('check_in_sent_at', null)
      .eq('occurred', false);

    if (error) {
      console.error('[post-meeting-checkin] Query error:', error.message);
      return json({ error: error.message }, 500);
    }

    if (!pendingMeetings || pendingMeetings.length === 0) {
      return json({ checked: 0 });
    }

    let checked = 0;
    const now = new Date().toISOString();

    for (const meeting of pendingMeetings) {
      const studentName = (meeting.student as any)?.full_name ?? 'your student';
      const mentorName = (meeting.mentor as any)?.full_name ?? 'your mentor';

      const checkInMsg = meeting.is_first_meeting
        ? `Your first call just ended! This was a big milestone.\n\nStudent: share your key learnings from today's session in the chat — what was the most valuable thing you took away?\n\nBoth: use the notes card above to record your meeting takeaways, then rate your experience below.`
        : `Your call just ended — how did it go?\n\nStudent: share your key learnings from today's session in the chat — what's your biggest takeaway?\n\nBoth: add your meeting notes using the card above, then log the outcome and rate your session below.`;

      const { error: sendError } = await supabase.rpc('send_bot_message', {
        p_conversation_id: meeting.conversation_id,
        p_content: checkInMsg,
      });

      if (sendError) {
        console.error(`[post-meeting-checkin] Failed to send for meeting ${meeting.id}:`, sendError.message);
        continue;
      }

      const { error: updateError } = await supabase
        .from('meetings')
        .update({ check_in_sent_at: now })
        .eq('id', meeting.id);

      if (updateError) {
        console.error(`[post-meeting-checkin] Failed to update meeting ${meeting.id}:`, updateError.message);
        continue;
      }

      // Notify student and mentor to log the outcome
      await sendPushToUser(
        supabase,
        meeting.student_id,
        'Share your learnings!',
        `Your session with ${mentorName} just ended — share your key takeaways in the chat.`,
        { type: 'post_meeting_checkin', conversationId: meeting.conversation_id },
      );

      await sendPushToUser(
        supabase,
        meeting.mentor_id,
        'Add your meeting notes',
        `Your session with ${studentName} just ended — add your notes and log the outcome.`,
        { type: 'post_meeting_checkin', conversationId: meeting.conversation_id },
      );

      checked++;
    }

    return json({ checked, total: pendingMeetings.length });
  } catch (err: any) {
    console.error('[post-meeting-checkin] Unhandled error:', err);
    return json({ error: err.message ?? 'Internal server error' }, 500);
  }
});
