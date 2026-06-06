import { supabase } from './supabase';

function trunc(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

// ─── Core bot send ────────────────────────────────────────────
// All bot messages go through the send_bot_message SECURITY DEFINER RPC
// which bypasses RLS and inserts with sender_type = 'bot', sender_id = NULL.

export async function sendBotMessage(
  conversationId: string,
  content: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc('send_bot_message', {
    p_conversation_id: conversationId,
    p_content: content,
  });
  if (error) {
    console.error('[Bot] Failed to send bot message:', error.message);
    return null;
  }
  return data as string;
}

// ─── Welcome sequence ─────────────────────────────────────────
// Called once when a new mentor assignment conversation is created.
// Sends 2 welcome messages then calls the generate-call-topics edge function.

export async function sendWelcomeSequence(
  conversationId: string,
  studentName: string,
  mentorName: string,
  mentorTitle: string,
  mentorField: string,
  mentorInstitution: string,
  studentGradeLevel: string,
  studentGoals: string
): Promise<void> {
  // Welcome message 1
  await sendBotMessage(
    conversationId,
    `Welcome to Mentara! I've matched you, ${trunc(studentName, 50)}, with ${trunc(mentorName, 50)}, ${trunc(mentorTitle, 100)} in ${trunc(mentorField, 80)}. This is your coordination space for your monthly calls.`
  );

  // Welcome message 2 — scheduling nudge
  await sendBotMessage(
    conversationId,
    `Your first step: schedule your first call. Use the card below to pick a time, platform (Zoom, Google Meet, etc.), and share the link. Once you've had your first call, I'll check in with how it went.`
  );

  // Generate tailored call topics via edge function
  try {
    const { data, error } = await supabase.functions.invoke('generate-call-topics', {
      body: {
        conversationId,
        mentorTitle,
        mentorField,
        mentorInstitution,
        studentName,
        studentGradeLevel,
        studentGoals,
      },
    });

    if (error) throw error;

    const topics: string[] = data?.topics ?? [];
    if (topics.length > 0) {
      await sendBotMessage(
        conversationId,
        `Here are some suggested topics to cover in your first call with ${trunc(mentorName, 50)}:`
      );
      for (const topic of topics) {
        await sendBotMessage(conversationId, `• ${trunc(topic, 200)}`);
      }
    }
  } catch (err) {
    console.error('[Bot] Topic generation failed:', err);
    // Fallback: send generic topics
    await sendBotMessage(
      conversationId,
      `Suggested call agenda:\n• What does a typical work day look like in ${mentorField}?\n• How to best position yourself for a career in this field?\n• Resume and application tips\n• What to do to set yourself up for success in ${mentorField}`
    );
  }
}

// ─── Post-meeting check-in helpers ───────────────────────────

export function buildCheckInMessage(
  otherUserName: string,
  isFirstMeeting: boolean
): string {
  const base = `Hey! Did your call with ${otherUserName} happen? Tap below to log your notes and rate the session.`;
  if (isFirstMeeting) {
    return `${base}\n\nThis was your first call! How did it go? Your rating helps keep Mentara great.`;
  }
  return base;
}

export function buildReassignmentPrompt(otherUserName: string): string {
  return `Thank you for your feedback. If you'd prefer a different match, reply "reassign" and I'll find a better fit for you.`;
}
