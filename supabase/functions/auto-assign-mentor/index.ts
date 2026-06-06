import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/push.ts';

// Edge Function: auto-assign-mentor
// Called at the end of student onboarding to automatically match a student
// with the best available mentor using Claude AI.

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

const MAX_STUDENTS_PER_MENTOR = 1;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey = Deno.env.get('GOOGLE_API_KEY')!;

  // Verify the caller is authenticated and is the student being matched.
  // Prevents a user from triggering assignment for someone else's account.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { studentId } = await req.json();
    if (!studentId) return json({ error: 'Missing studentId' }, 400);

    // Caller must be the student — prevent cross-account manipulation
    if (user.id !== studentId) return json({ error: 'Forbidden' }, 403);

    // 1. Fetch student profile
    const { data: studentProfile, error: spError } = await supabase
      .from('student_profiles')
      .select('grade_level, fields_of_interest, learning_goals')
      .eq('id', studentId)
      .maybeSingle();

    if (spError || !studentProfile) {
      return json({ error: 'Student profile not found', assigned: false }, 404);
    }

    const { grade_level, fields_of_interest, learning_goals } = studentProfile;

    if (!fields_of_interest || fields_of_interest.length === 0) {
      return json({ error: 'Student has no fields of interest', assigned: false }, 400);
    }

    // 2. Check if already assigned
    const { data: existing } = await supabase
      .from('mentor_assignments')
      .select('id')
      .eq('student_id', studentId)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return json({ error: 'Student already has an active assignment', assigned: false }, 409);
    }

    // 3. Fetch available mentors — must share at least one field, be verified, and available
    const { data: candidateMentors, error: mError } = await supabase
      .from('mentor_profiles')
      .select(`
        id,
        title,
        institution,
        fields_of_expertise,
        years_experience,
        preferred_student_levels,
        mentoring_style,
        rating,
        profile:profiles!mentor_profiles_id_fkey(full_name)
      `)
      .overlaps('fields_of_expertise', fields_of_interest)
      .eq('is_available', true)
      .eq('verified', true);

    if (mError || !candidateMentors || candidateMentors.length === 0) {
      return json({ assigned: false, reason: 'No available mentors in your field yet' });
    }

    // 4. Exclude mentors who already have MAX_STUDENTS_PER_MENTOR active assignments
    //    (safety net against race conditions — is_available is the primary guard)
    const candidateIds = candidateMentors.map((m: any) => m.id);
    const { data: fullAssignments } = await supabase
      .from('mentor_assignments')
      .select('mentor_id')
      .in('mentor_id', candidateIds)
      .eq('status', 'active');

    const assignmentCounts = new Map<string, number>();
    for (const a of fullAssignments ?? []) {
      assignmentCounts.set(a.mentor_id, (assignmentCounts.get(a.mentor_id) ?? 0) + 1);
    }
    const availableMentors = candidateMentors.filter(
      (m: any) => (assignmentCounts.get(m.id) ?? 0) < MAX_STUDENTS_PER_MENTOR
    );

    if (availableMentors.length === 0) {
      return json({ assigned: false, reason: 'No available mentors in your field yet' });
    }

    // 5. Ask Gemini to pick the best match
    const mentorList = availableMentors.map((m: any) => ({
      id: m.id,
      name: (m.profile as any)?.full_name ?? 'Unknown',
      title: m.title,
      institution: m.institution,
      fields_of_expertise: m.fields_of_expertise,
      years_experience: m.years_experience,
      preferred_student_levels: m.preferred_student_levels,
      mentoring_style: m.mentoring_style,
    }));

    const prompt = `You are a mentor-matching system. Given a student's profile and available mentors, select the single best mentor match.

Student profile:
- Grade level: ${grade_level}
- Fields of interest: ${(fields_of_interest ?? []).join(', ')}
- Learning goals: ${learning_goals ?? 'Not specified'}

Available mentors:
${JSON.stringify(mentorList, null, 2)}

Consider: field overlap, grade level compatibility (preferred_student_levels), mentoring style, years of experience appropriate to student goals.

Return ONLY valid JSON with this exact structure:
{"mentor_id": "<uuid>", "assigned_field": "<primary field>", "reasoning": "<1-2 sentence explanation>"}`;

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

    // availableMentors is already filtered to field-overlapping, available mentors only.
    // The fallback picks the first from that same filtered list — never a cross-field mentor.
    const fallbackMentor = availableMentors[0];
    const fallbackField =
      (fallbackMentor.fields_of_expertise as string[]).find((f: string) =>
        (fields_of_interest as string[]).includes(f)
      ) ?? fields_of_interest[0];
    const firstMentorFallback = {
      mentor_id: fallbackMentor.id,
      assigned_field: fallbackField,
      reasoning: 'Assigned based on field match.',
    };

    let matchResult: { mentor_id: string; assigned_field: string; reasoning: string };

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[auto-assign-mentor] Gemini error, falling back to first mentor:', errText);
      matchResult = firstMentorFallback;
    } else {
      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        matchResult = JSON.parse(jsonMatch?.[0] ?? rawText);
      } catch {
        console.error('[auto-assign-mentor] Failed to parse Gemini response, falling back:', rawText);
        matchResult = firstMentorFallback;
      }
    }

    const { mentor_id, assigned_field, reasoning } = matchResult;

    // Validate mentor_id is in the field-filtered list; fall back if not
    const validMentor = availableMentors.find((m: any) => m.id === mentor_id);
    if (!validMentor) {
      console.error('[auto-assign-mentor] Gemini returned invalid mentor_id, falling back:', mentor_id);
      matchResult = firstMentorFallback;
    }

    // 6. Get or create conversation (atomic RPC — eliminates TOCTOU race)
    const { data: convRow, error: convError } = await supabase
      .rpc('get_or_create_conversation', {
        p_student_id: studentId,
        p_mentor_id: matchResult.mentor_id,
      });

    if (convError || !convRow) {
      console.error('[auto-assign-mentor] Failed to get/create conversation:', convError?.message);
      return json({ error: 'Failed to create conversation', assigned: false }, 500);
    }
    const conversationId: string = convRow.id;

    // 7. Insert assignment
    const { data: assignment, error: assignError } = await supabase
      .from('mentor_assignments')
      .insert({
        student_id: studentId,
        mentor_id: matchResult.mentor_id,
        assigned_field: matchResult.assigned_field,
        assigned_by: 'ai',
        conversation_id: conversationId,
        status: 'active',
        assignment_reasoning: reasoning,
      })
      .select('id')
      .single();

    if (assignError) {
      console.error('[auto-assign-mentor] Insert error:', assignError.message);
      return json({ error: 'Failed to save assignment', assigned: false }, 500);
    }

    // 8. Mark mentor as unavailable so they don't appear in future match queries
    const { error: availError } = await supabase
      .from('mentor_profiles')
      .update({ is_available: false })
      .eq('id', matchResult.mentor_id);

    if (availError) {
      console.error('[auto-assign-mentor] Failed to mark mentor unavailable:', availError.message);
    }

    // 10. Trigger generate-call-topics in the background
    const mentorData = availableMentors.find((m: any) => m.id === matchResult.mentor_id);
    const studentName = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', studentId)
      .maybeSingle()
      .then(({ data }: any) => data?.full_name ?? 'your student');

    // Fire-and-forget: generate topics
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
    supabase.functions.invoke('generate-call-topics', {
      headers: { Authorization: `Bearer ${internalSecret}` },
      body: {
        conversationId,
        mentorTitle: mentorData?.title ?? 'Professional',
        mentorField: matchResult.assigned_field,
        mentorInstitution: mentorData?.institution ?? '',
        studentName,
        studentGradeLevel: grade_level,
        studentGoals: learning_goals ?? '',
      },
    }).catch((err: any) => console.error('[auto-assign-mentor] Topic generation failed:', err));

    // Notify student that they have been matched
    const mentorName = (mentorData?.profile as any)?.full_name ?? 'a mentor';
    await sendPushToUser(
      supabase,
      studentId,
      "You've been matched! 🎉",
      `You've been paired with ${mentorName}. Say hello and schedule your first call!`,
      { type: 'mentor_assigned', conversationId, mentorId: matchResult.mentor_id },
    );

    return json({
      assigned: true,
      conversationId,
      mentorId: matchResult.mentor_id,
      assignedField: matchResult.assigned_field,
      assignmentId: assignment.id,
    });
  } catch (err: any) {
    console.error('[auto-assign-mentor] Unhandled error:', err);
    return json({ error: err.message ?? 'Internal server error', assigned: false }, 500);
  }
});
