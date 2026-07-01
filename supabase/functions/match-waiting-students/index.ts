import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Edge Function: match-waiting-students
// Internal-only — called by auto-verify-mentor and verify-mentor when a mentor is approved.
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
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { mentorId } = await req.json();
    if (!mentorId) return json({ error: 'Missing mentorId' }, 400);

    // 1. Get the new mentor's fields and confirm they're available
    const { data: mentorProfile, error: mpError } = await supabase
      .from('mentor_profiles')
      .select('fields_of_expertise, is_available')
      .eq('id', mentorId)
      .maybeSingle();

    if (mpError || !mentorProfile) {
      return json({ error: 'Mentor profile not found' }, 404);
    }
    if (!mentorProfile.is_available) {
      return json({ triggered: false, reason: 'Mentor is already matched' });
    }

    const { fields_of_expertise } = mentorProfile;
    if (!fields_of_expertise || fields_of_expertise.length === 0) {
      return json({ triggered: false, reason: 'Mentor has no fields of expertise' });
    }

    // 2. Find students who share a field and have no active assignment
    const { data: eligibleStudents, error: sError } = await supabase
      .from('student_profiles')
      .select('id, fields_of_interest')
      .overlaps('fields_of_interest', fields_of_expertise);

    if (sError || !eligibleStudents || eligibleStudents.length === 0) {
      return json({ triggered: false, reason: 'No students in matching fields' });
    }

    const studentIds = eligibleStudents.map((s: any) => s.id);

    // 3. Exclude students who already have an active assignment
    const { data: existingAssignments } = await supabase
      .from('mentor_assignments')
      .select('student_id')
      .in('student_id', studentIds)
      .eq('status', 'active');

    const assignedIds = new Set((existingAssignments ?? []).map((a: any) => a.student_id));
    const waitingStudents = eligibleStudents.filter((s: any) => !assignedIds.has(s.id));

    if (waitingStudents.length === 0) {
      return json({ triggered: false, reason: 'No unmatched students in matching fields' });
    }

    // 4. Trigger auto-assign-mentor for the first waiting student.
    //    Pass the internal secret so auto-assign-mentor authorizes this as an
    //    internal (non-student) caller — it can't verify a student JWT here.
    //    The enforce_mentor_capacity trigger + unique student index keep
    //    assignment creation race-safe even if multiple calls overlap.
    const target = waitingStudents[0];
    supabase.functions.invoke('auto-assign-mentor', {
      headers: { Authorization: `Bearer ${internalSecret}` },
      body: { studentId: target.id },
    }).catch((err: any) =>
      console.error('[match-waiting-students] auto-assign-mentor failed:', err)
    );

    console.log(`[match-waiting-students] Triggered match for student ${target.id}`);
    return json({ triggered: true, studentId: target.id });

  } catch (err: any) {
    console.error('[match-waiting-students] Unhandled error:', err);
    return json({ error: err.message ?? 'Internal server error' }, 500);
  }
});
