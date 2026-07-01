// Edge Function: notify-new-message
// Called fire-and-forget from sendMessage() in lib/supabase.ts after a human
// message is inserted. Looks up the other conversation participant and sends
// them an Expo push notification.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/push.ts';

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
    const { conversationId, senderId, messagePreview, messageId } = await req.json();
    if (!conversationId || !senderId) return json({ error: 'Missing params' }, 400);

    // Deduplication: if a messageId was provided, claim notification_sent_at
    // atomically before sending the push. Concurrent retries see a non-null value
    // and skip, preventing duplicate notifications for the same message.
    if (messageId) {
      const { data: claimed } = await supabase
        .from('messages')
        .update({ notification_sent_at: new Date().toISOString() })
        .eq('id', messageId)
        .is('notification_sent_at', null)
        .select('id')
        .single();

      if (!claimed) {
        // Another invocation already claimed this message
        return json({ sent: false, reason: 'already_sent' });
      }
    }

    // Find the other participant
    const { data: conv } = await supabase
      .from('conversations')
      .select('student_id, mentor_id')
      .eq('id', conversationId)
      .single();

    if (!conv) return json({ sent: false });

    const recipientId = conv.student_id === senderId ? conv.mentor_id : conv.student_id;

    // Get sender name for the notification title
    const { data: sender } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', senderId)
      .single();

    const senderName = sender?.full_name ?? 'New message';
    const preview = (messagePreview ?? '').slice(0, 80) || 'Sent you a message';

    await sendPushToUser(supabase, recipientId, senderName, preview, {
      type: 'new_message',
      conversationId,
    });

    return json({ sent: true });
  } catch (err: any) {
    console.error('[notify-new-message] Error:', err);
    return json({ error: err.message ?? 'Internal server error' }, 500);
  }
});
