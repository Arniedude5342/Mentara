// Edge Function: notify-meeting-reminder
// Internal-only — triggered by Supabase cron every 5 minutes.
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
    // Match meetings scheduled 25–35 minutes from now that haven't been reminded yet.
    // Running every 5 min means every meeting hits this window exactly once.
    const windowStart = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    const windowEnd   = new Date(Date.now() + 35 * 60 * 1000).toISOString();

    const { data: upcomingMeetings, error } = await supabase
      .from('meetings')
      .select(`
        id,
        conversation_id,
        student_id,
        mentor_id,
        scheduled_at,
        platform,
        meeting_link,
        student:profiles!student_id(full_name),
        mentor:profiles!mentor_id(full_name)
      `)
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd)
      .is('reminder_sent_at', null);

    if (error) {
      console.error('[notify-meeting-reminder] Query error:', error.message);
      return json({ error: error.message }, 500);
    }

    if (!upcomingMeetings || upcomingMeetings.length === 0) {
      return json({ sent: 0 });
    }

    const platformLabel: Record<string, string> = {
      zoom: 'Zoom',
      google_meet: 'Google Meet',
      teams: 'Microsoft Teams',
      facetime: 'FaceTime',
      other: 'video call',
    };

    let sent = 0;
    const now = new Date().toISOString();

    for (const meeting of upcomingMeetings) {
      const studentName = (meeting.student as any)?.full_name ?? 'your student';
      const mentorName  = (meeting.mentor as any)?.full_name ?? 'your mentor';
      const platform    = platformLabel[meeting.platform] ?? 'call';
      const timeStr     = new Date(meeting.scheduled_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York',
      });

      // Mark reminder_sent_at first — prevents double-send if push calls are slow
      const { error: markError } = await supabase
        .from('meetings')
        .update({ reminder_sent_at: now })
        .eq('id', meeting.id);

      if (markError) {
        console.error(`[notify-meeting-reminder] Failed to mark meeting ${meeting.id}:`, markError.message);
        continue;
      }

      // Notify student
      await sendPushToUser(
        supabase,
        meeting.student_id,
        'Your call starts in 30 minutes',
        `Your ${platform} session with ${mentorName} starts at ${timeStr}. Get ready!`,
        { type: 'meeting_reminder', conversationId: meeting.conversation_id },
      );

      // Notify mentor
      await sendPushToUser(
        supabase,
        meeting.mentor_id,
        'Your call starts in 30 minutes',
        `Your ${platform} session with ${studentName} starts at ${timeStr}. Get ready!`,
        { type: 'meeting_reminder', conversationId: meeting.conversation_id },
      );

      sent++;
    }

    return json({ sent, total: upcomingMeetings.length });
  } catch (err: any) {
    console.error('[notify-meeting-reminder] Unhandled error:', err);
    return json({ error: err.message ?? 'Internal server error' }, 500);
  }
});
