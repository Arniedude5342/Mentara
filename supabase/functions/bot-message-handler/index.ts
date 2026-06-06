// Edge Function: bot-message-handler
// Called by the client after each human message is sent.
// Claude Sonnet monitors the conversation and responds when appropriate
// (e.g., to nudge scheduling, confirm meetings, or follow up post-call).

import { sendPushToUser } from '../_shared/push.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey = Deno.env.get('GOOGLE_API_KEY')!;

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

  // Verify the caller is an authenticated user before running AI logic
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { conversationId } = await req.json();
    if (!conversationId) return json({ error: 'Missing conversationId' }, 400);

    // Verify caller is a participant of this conversation
    const { data: conv } = await supabase
      .from('conversations')
      .select('student_id, mentor_id')
      .eq('id', conversationId)
      .single();
    if (!conv || (conv.student_id !== user.id && conv.mentor_id !== user.id)) {
      return json({ error: 'Forbidden' }, 403);
    }

    // Fetch last 12 messages for context
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('content, sender_type, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(12);

    if (msgError) return json({ error: 'Failed to fetch messages', responded: false }, 500);

    const recentMessages = (messages ?? []).reverse();

    // Don't respond if the last message is already from the bot
    const lastMessage = recentMessages[recentMessages.length - 1];
    if (!lastMessage || lastMessage.sender_type === 'bot') {
      return json({ responded: false });
    }

    // Check if there's an upcoming meeting
    const { data: meetings } = await supabase
      .from('meetings')
      .select('id, scheduled_at, platform, occurred')
      .eq('conversation_id', conversationId)
      .eq('occurred', false)
      .gt('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1);

    const hasUpcomingMeeting = meetings && meetings.length > 0;
    const upcomingMeeting = hasUpcomingMeeting ? meetings[0] : null;

    // Build context for Claude
    const conversationContext = recentMessages
      .map((m: any) => `[${m.sender_type === 'bot' ? 'Mentara Bot' : 'User'}]: ${m.content}`)
      .join('\n');

    const meetingContext = upcomingMeeting
      ? `There IS an upcoming call scheduled for ${new Date(upcomingMeeting.scheduled_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`
      : 'There is NO call scheduled yet.';

    const systemPrompt = `You are Mentara, a helpful coordinator for a mentorship platform. Your job is to help schedule monthly calls between a student and their mentor.

${meetingContext}

Rules:
- Keep replies SHORT (1-3 sentences max)
- If no call is scheduled, gently remind them to schedule one using the scheduling tool in the app
- If a call IS scheduled, you can acknowledge it or wish them well
- Do NOT answer academic questions — redirect those to their upcoming call
- Do NOT repeat what you've already said in previous messages
- Only respond if your reply would genuinely add value. If the conversation is just casual back-and-forth or scheduling coordination, stay silent.
- Return the string "NO_RESPONSE" if you should not respond.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              parts: [
                {
                  text: `Recent conversation:\n${conversationContext}\n\nShould you respond? If yes, what would you say? If no, return "NO_RESPONSE".`,
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 150 },
        }),
      }
    );

    if (!geminiRes.ok) {
      console.error('[bot-message-handler] Gemini error:', await geminiRes.text());
      return json({ responded: false });
    }

    const geminiData = await geminiRes.json();
    const botReply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

    if (!botReply || botReply === 'NO_RESPONSE' || botReply.startsWith('NO_RESPONSE')) {
      return json({ responded: false });
    }

    // Send bot message
    await supabase.rpc('send_bot_message', {
      p_conversation_id: conversationId,
      p_content: botReply,
    });

    // Notify both participants — the bot may be nudging either the student or mentor
    if (conv) {
      const preview = botReply.slice(0, 80);
      await Promise.all([
        sendPushToUser(supabase, conv.student_id, 'Mentara', preview, { type: 'bot_message', conversationId }),
        sendPushToUser(supabase, conv.mentor_id, 'Mentara', preview, { type: 'bot_message', conversationId }),
      ]);
    }

    return json({ responded: true });
  } catch (err: any) {
    console.error('[bot-message-handler] Error:', err);
    return json({ error: err.message ?? 'Internal server error', responded: false }, 500);
  }
});
