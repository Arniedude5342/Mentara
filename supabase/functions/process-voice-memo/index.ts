// Edge Function: process-voice-memo
// Called by the client after uploading a voice memo to Supabase Storage.
// Downloads audio, sends to Gemini 1.5 Flash for transcription + insight extraction,
// updates the voice_memos row, and posts a bot message with the key takeaway.

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
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey = Deno.env.get('GOOGLE_API_KEY')!;

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, serviceKey);

  // Verify caller is an authenticated user
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let voiceMemoId: string | undefined;

  try {
    ({ voiceMemoId } = await req.json());
    if (!voiceMemoId) return json({ error: 'Missing voiceMemoId' }, 400);

    // Fetch the voice_memos row (also validates ownership via student_id check below)
    const { data: memo, error: fetchError } = await supabase
      .from('voice_memos')
      .select('id, audio_url, conversation_id, student_id')
      .eq('id', voiceMemoId)
      .single();

    if (fetchError || !memo) {
      return json({ error: fetchError?.message ?? 'Voice memo not found' }, 404);
    }

    // Ensure the authenticated user owns this memo
    if (memo.student_id !== user.id) return json({ error: 'Forbidden' }, 403);

    // Mark as processing
    await supabase
      .from('voice_memos')
      .update({ processing_status: 'processing' })
      .eq('id', voiceMemoId);

    // Download audio from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('voice-memos')
      .download(memo.audio_url);

    if (downloadError || !fileData) {
      throw new Error(downloadError?.message ?? 'Failed to download audio');
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64Audio = btoa(binary);

    // Send to Gemini 1.5 Flash with inline audio
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: 'audio/m4a',
                  data: base64Audio,
                },
              },
              {
                text: `Transcribe this student voice reflection recorded after a mentorship call. Then extract insights.

Return ONLY valid JSON in this exact format:
{
  "transcript": "<full transcription of what was said>",
  "key_insight": "<one sentence capturing the most important thing the student learned>",
  "action_item": "<one specific, actionable next step the student should take>"
}

If the audio is unclear or too short, still return the JSON with best-effort values.`,
              },
            ],
          }],
          generationConfig: { maxOutputTokens: 512 },
        }),
      }
    );

    let transcript = '';
    let aiInsight = '';
    let aiActionItem = '';

    if (geminiRes.ok) {
      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch?.[0] ?? rawText);
        transcript = parsed.transcript ?? '';
        aiInsight = parsed.key_insight ?? '';
        aiActionItem = parsed.action_item ?? '';
      } catch {
        console.error('[process-voice-memo] Failed to parse Gemini response:', rawText);
      }
    } else {
      const errText = await geminiRes.text();
      console.error('[process-voice-memo] Gemini API error:', errText);
    }

    // Update voice_memos row with results
    const { error: updateError } = await supabase
      .from('voice_memos')
      .update({
        transcript: transcript || null,
        ai_insight: aiInsight || null,
        ai_action_item: aiActionItem || null,
        processing_status: 'completed',
      })
      .eq('id', voiceMemoId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Post bot message in conversation with insight
    if (aiInsight || aiActionItem) {
      let botMsg = '📝 Reflection saved!';
      if (aiInsight) botMsg += `\n\nKey takeaway: ${aiInsight}`;
      if (aiActionItem) botMsg += `\n\nNext step: ${aiActionItem}`;

      await supabase.rpc('send_bot_message', {
        p_conversation_id: memo.conversation_id,
        p_content: botMsg,
      });
    }

    return json({ success: true, voiceMemoId });
  } catch (err: any) {
    console.error('[process-voice-memo] Error:', err);

    // Mark as failed so the client knows
    if (voiceMemoId) {
      await supabase
        .from('voice_memos')
        .update({ processing_status: 'failed' })
        .eq('id', voiceMemoId);
    }

    return json({ error: err.message ?? 'Internal server error' }, 500);
  }
});
