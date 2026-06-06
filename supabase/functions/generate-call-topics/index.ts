// Edge Function: generate-call-topics
// Internal-only — called by auto-assign-mentor after a match is created.
// Callers must pass Authorization: Bearer <INTERNAL_FUNCTION_SECRET>.

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
  const geminiKey = Deno.env.get('GOOGLE_API_KEY')!;

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const {
      conversationId,
      mentorTitle,
      mentorField,
      mentorInstitution,
      studentName,
      studentGradeLevel,
      studentGoals,
    } = await req.json();

    if (!conversationId) return json({ error: 'Missing conversationId' }, 400);

    // Send welcome messages first
    const mentorDisplay = [mentorTitle, mentorInstitution].filter(Boolean).join(' at ');
    const studentFirst = (studentName ?? 'there').split(' ')[0];
    const welcomeMsg = `🎉 Congratulations, ${studentFirst}! You've been matched.

This is your call thread with your mentor. Here's how it works:

• One call per month — around 45–60 minutes
• Use this thread to coordinate timing and share your meeting link
• I'll suggest talking points before each call so you always come prepared

Go ahead and send a message to introduce yourself!`;

    await supabase.rpc('send_bot_message', {
      p_conversation_id: conversationId,
      p_content: welcomeMsg,
    });

    // Generate tailored topics with Claude
    const prompt = `You are helping a student prepare for monthly mentorship calls with ${mentorDisplay || 'a mentor'} in the field of ${mentorField}.

Student profile:
- Name: ${studentName}
- Grade/level: ${studentGradeLevel}
- Goals: ${studentGoals || 'Not specified'}

Generate exactly 4 specific, practical call agenda topics for their first call. Each topic should be a concrete question or discussion point — not generic advice.

Format as a JSON array of strings, for example:
["What does a typical work day look like as a ${mentorTitle ?? 'professional'} at ${mentorInstitution ?? 'your company'}?", ...]

Return ONLY the JSON array, nothing else.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 256 },
        }),
      }
    );

    let topics: string[] = [];

    if (geminiRes.ok) {
      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      try {
        const arrayMatch = rawText.match(/\[[\s\S]*\]/);
        topics = JSON.parse(arrayMatch?.[0] ?? rawText);
      } catch {
        console.error('[generate-call-topics] Failed to parse Gemini response:', rawText);
      }
    } else {
      console.error('[generate-call-topics] Gemini error:', await geminiRes.text());
    }

    // Fallback topics if Claude fails
    if (!Array.isArray(topics) || topics.length === 0) {
      topics = [
        `What does a typical work day look like as a ${mentorTitle ?? 'professional'} in ${mentorField}?`,
        `How did you break into ${mentorField}, and what would you do differently?`,
        `What skills are most important for someone starting out in ${mentorField}?`,
        `What resources or habits have helped you most in your career?`,
      ];
    }

    // Fetch open action items from the previous call
    const { data: openItems } = await supabase
      .from('action_items')
      .select('content')
      .eq('conversation_id', conversationId)
      .eq('completed', false);

    const hasOpenItems = openItems && openItems.length > 0;
    let topicsMsg = '';
    if (hasOpenItems) {
      const itemLines = openItems.map((i: any) => `  • ${i.content}`).join('\n');
      topicsMsg += `📋 From your last call, you committed to:\n${itemLines}\n\n`;
    }

    const callLabel = hasOpenItems ? 'next call' : 'first call';
    topicsMsg += `Here are some topics to explore on your ${callLabel}:\n\n${topics.map((t, i) => `${i + 1}. ${t}`).join('\n\n')}

Feel free to add your own questions. Use the scheduling tool below to pick a time that works for both of you!`;

    await supabase.rpc('send_bot_message', {
      p_conversation_id: conversationId,
      p_content: topicsMsg,
    });

    return json({ success: true, topicCount: topics.length });
  } catch (err: any) {
    console.error('[generate-call-topics] Error:', err);
    return json({ error: err.message ?? 'Internal server error' }, 500);
  }
});
