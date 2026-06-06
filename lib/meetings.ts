import { supabase, checkRateLimit } from './supabase';
import { Meeting, PostMeetingRating, ActionItem, RescheduleRequest } from './types';
import { sendBotMessage } from './botMessages';

function logError(context: string, message: string): void {
  if (__DEV__) console.warn('[Meetings]', context, message);
}

// ─── Schedule a call ──────────────────────────────────────────

export async function scheduleMeeting(
  conversationId: string,
  studentId: string,
  mentorId: string,
  scheduledAt: Date,
  platform: Meeting['platform'],
  meetingLink: string | null,
  isFirstMeeting: boolean,
  idempotencyKey?: string,
  scheduledBy?: string,
): Promise<Meeting | null> {
  const schedulerId = scheduledBy ?? studentId;
  const allowed = await checkRateLimit(`schedule_meeting:${schedulerId}`);
  if (!allowed) {
    logError('[Meetings] scheduleMeeting', 'Rate limit exceeded');
    return null;
  }

  if (meetingLink !== null) {
    const trimmed = meetingLink.trim();
    if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
      logError('[Meetings] scheduleMeeting', 'Invalid meeting link protocol — rejected');
      meetingLink = null;
    } else if (trimmed.length > 500) {
      logError('[Meetings] scheduleMeeting', 'Meeting link too long — rejected');
      meetingLink = null;
    } else {
      meetingLink = trimmed;
    }
  }

  const { data, error } = await supabase
    .from('meetings')
    .insert({
      conversation_id: conversationId,
      student_id: studentId,
      mentor_id: mentorId,
      scheduled_by: schedulerId,
      platform,
      meeting_link: meetingLink,
      scheduled_at: scheduledAt.toISOString(),
      is_first_meeting: isFirstMeeting,
      ...(idempotencyKey ? { client_idempotency_key: idempotencyKey } : {}),
    })
    .select()
    .single();

  // Idempotent retry: unique-constraint violation means meeting was already created
  if (error && error.code === '23505' && idempotencyKey) {
    const { data: existing } = await supabase
      .from('meetings')
      .select('*')
      .eq('client_idempotency_key', idempotencyKey)
      .single();
    if (existing) return existing as Meeting;
  }

  if (error) {
    logError('[Meetings] Failed to schedule meeting', error.message);
    return null;
  }

  // Send bot confirmation message
  const dateStr = scheduledAt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const platformLabel: Record<Meeting['platform'], string> = {
    zoom: 'Zoom',
    google_meet: 'Google Meet',
    teams: 'Microsoft Teams',
    facetime: 'FaceTime',
    other: 'video call',
  };
  await sendBotMessage(
    conversationId,
    `Call confirmed! Your ${platformLabel[platform]} call is scheduled for ${dateStr}.${meetingLink ? ` Join link: ${meetingLink}` : ''} I'll check in with you both after the call.`
  );

  // Fire-and-forget — don't await, don't block the return
  supabase.functions.invoke('send-meeting-invite', { body: { meeting_id: data.id } }).catch(() => {});

  return data as Meeting;
}

// ─── In-app accept / decline a meeting invite ─────────────────

export async function respondToMeetingInviteInApp(
  meetingId: string,
  conversationId: string,
  action: 'confirmed' | 'declined',
  responderId: string,
  scheduledById: string | null,
  studentId: string,
  responderName: string,
): Promise<boolean> {
  const allowed = await checkRateLimit(`meeting_respond:${responderId}`, 5, 15);
  if (!allowed) {
    logError('[Meetings] respondToMeetingInviteInApp', 'Rate limit exceeded');
    return false;
  }

  const { error } = await supabase
    .from('meetings')
    .update({ invite_status: action })
    .eq('id', meetingId)
    .eq('invite_status', 'pending');

  if (error) {
    logError('[Meetings] Failed to update invite_status', error.message);
    return false;
  }

  const actionLabel = action === 'confirmed' ? 'accepted' : 'declined';
  await sendBotMessage(
    conversationId,
    `${responderName} has ${actionLabel} the meeting request.${action === 'declined' ? ' Please suggest a new time.' : ''}`,
  );

  if (action === 'confirmed') {
    // Send confirmation emails to both + push to scheduler
    supabase.functions.invoke('send-meeting-confirmation', { body: { meeting_id: meetingId } }).catch(() => {});
  } else {
    // Push to whoever scheduled so they know to reschedule
    const schedulerId = scheduledById ?? studentId;
    supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: schedulerId,
        title: 'Meeting Declined',
        body: `${responderName} declined the meeting. Please suggest a new time.`,
        data: { type: 'meeting_declined', meeting_id: meetingId },
      },
    }).catch(() => {});
  }

  return true;
}

// ─── Get meetings for a conversation ─────────────────────────

export async function getMeetingsForConversation(
  conversationId: string
): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('scheduled_at', { ascending: true });

  if (error) {
    logError('[Meetings] Failed to fetch meetings', error.message);
    return [];
  }
  return (data ?? []) as Meeting[];
}

// ─── Log meeting outcome ──────────────────────────────────────

export async function updateMeetingOutcome(
  meetingId: string,
  occurred: boolean,
  studentNotes?: string,
  mentorNotes?: string
): Promise<boolean> {
  const allowed = await checkRateLimit(`meeting_outcome:${meetingId}`, 10, 15);
  if (!allowed) return false;
  const { error } = await supabase
    .from('meetings')
    .update({
      occurred,
      ...(studentNotes !== undefined && { student_notes: studentNotes }),
      ...(mentorNotes !== undefined && { mentor_notes: mentorNotes }),
    })
    .eq('id', meetingId);

  if (error) {
    logError('[Meetings] Failed to update meeting outcome', error.message);
    return false;
  }
  return true;
}

// ─── Submit post-meeting feedback ────────────────────────────

export async function submitPostMeetingFeedback(
  meetingId: string,
  raterId: string,
  rateeId: string,
  hadProblems: boolean,
  problemDetails?: string,
  rating?: number
): Promise<PostMeetingRating | null> {
  const allowed = await checkRateLimit(`feedback:${raterId}`, 5, 15);
  if (!allowed) {
    logError('[Meetings] submitPostMeetingFeedback', 'Rate limit exceeded');
    return null;
  }
  if (problemDetails && problemDetails.length > 1000) {
    logError('[Meetings] submitPostMeetingFeedback', 'Problem details too long');
    return null;
  }
  const validRating = rating != null && rating >= 1 && rating <= 5 ? rating : null;

  const { data, error } = await supabase
    .from('post_meeting_ratings')
    .insert({
      meeting_id: meetingId,
      rater_id: raterId,
      ratee_id: rateeId,
      rating: validRating,
      had_problems: hadProblems,
      problem_details: problemDetails?.trim() ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      // Already submitted — not an error, just ignore
      return null;
    }
    logError('[Meetings] Failed to submit feedback', error.message);
    return null;
  }
  return data as PostMeetingRating;
}

// ─── Get mentor assignments ───────────────────────────────────

export async function getMyAssignment(userId: string, role: 'student' | 'mentor') {
  const field = role === 'student' ? 'student_id' : 'mentor_id';
  const selectQuery = role === 'student'
    ? `*, other_user:profiles!mentor_assignments_mentor_id_fkey(id, full_name, avatar_url, bio, location, mentor_profiles(title, institution, fields_of_expertise, rating, review_count))`
    : `*, other_user:profiles!mentor_assignments_student_id_fkey(id, full_name, avatar_url, bio, location)`;
  const { data, error } = await supabase
    .from('mentor_assignments')
    .select(selectQuery)
    .eq(field, userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Table may not exist yet in this environment — suppress noise
    if (!error.message?.includes('schema cache')) {
      logError('[Assignments] Failed to fetch assignment', error.message);
    }
    return null;
  }
  return data;
}

export async function getMentorStudents(mentorId: string) {
  // student_profiles has no direct FK from mentor_assignments — nest it inside
  // the profiles join and normalise the shape so callers see `student_profile`.
  const { data: assignments, error } = await supabase
    .from('mentor_assignments')
    .select(`
      *,
      other_user:profiles!mentor_assignments_student_id_fkey(
        id, full_name, avatar_url, bio, location,
        student_profiles(grade_level, fields_of_interest, learning_goals)
      )
    `)
    .eq('mentor_id', mentorId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    logError('[Assignments] Failed to fetch mentor students', error.message);
    return [];
  }
  return (assignments ?? []).map((a: any) => ({
    ...a,
    student_profile: a.other_user?.student_profiles ?? null,
  }));
}

// ─── Get all meetings for a student ──────────────────────────

export async function getStudentMeetings(studentId: string): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select(`
      *,
      mentor:profiles!meetings_mentor_id_fkey(id, full_name, avatar_url, mentor_profiles(title, institution))
    `)
    .eq('student_id', studentId)
    .order('scheduled_at', { ascending: false });

  if (error) {
    // Table may not exist yet — return empty silently
    return [];
  }
  return (data ?? []) as Meeting[];
}

// ─── Get all meetings for a mentor ────────────────────────────

export async function getMentorMeetings(mentorId: string): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select(`
      *,
      student:profiles!meetings_student_id_fkey(id, full_name, avatar_url)
    `)
    .eq('mentor_id', mentorId)
    .order('scheduled_at', { ascending: false });

  if (error) {
    return [];
  }
  return (data ?? []) as Meeting[];
}

// ─── Action Items ─────────────────────────────────────────────

export async function getActionItems(conversationId: string): Promise<ActionItem[]> {
  const { data, error } = await supabase
    .from('action_items')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    logError('[ActionItems] Failed to fetch', error.message);
    return [];
  }
  return (data ?? []) as ActionItem[];
}

export async function addActionItem(
  conversationId: string,
  createdBy: string,
  content: string,
  dueDate?: string | null,
): Promise<ActionItem | null> {
  const allowed = await checkRateLimit(`action_item:${createdBy}`, 20, 15);
  if (!allowed) {
    logError('[ActionItems] addActionItem', 'Rate limit exceeded');
    return null;
  }
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 500) return null;

  const { data, error } = await supabase
    .from('action_items')
    .insert({
      conversation_id: conversationId,
      created_by: createdBy,
      content: trimmed,
      due_date: dueDate ?? null,
    })
    .select()
    .single();

  if (error) {
    logError('[ActionItems] Failed to add', error.message);
    return null;
  }
  return data as ActionItem;
}

export async function toggleActionItem(itemId: string, completed: boolean): Promise<boolean> {
  const allowed = await checkRateLimit(`toggle_action:${itemId}`, 10, 15);
  if (!allowed) return false;
  const { error } = await supabase
    .from('action_items')
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', itemId);

  if (error) {
    logError('[ActionItems] Failed to toggle', error.message);
    return false;
  }
  return true;
}

export async function deleteActionItem(itemId: string): Promise<boolean> {
  const allowed = await checkRateLimit(`delete_action:${itemId}`, 5, 15);
  if (!allowed) return false;
  const { error } = await supabase
    .from('action_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    logError('[ActionItems] Failed to delete', error.message);
    return false;
  }
  return true;
}

// ─── Reschedule Requests ──────────────────────────────────────

export async function getPendingReschedule(
  meetingId: string,
): Promise<RescheduleRequest | null> {
  const { data, error } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) {
    logError('[Reschedule] Failed to fetch pending request', error.message);
    return null;
  }
  return data as RescheduleRequest | null;
}

export async function requestReschedule(
  meetingId: string,
  conversationId: string,
  requesterId: string,
  proposedAt: Date,
  requesterName: string,
): Promise<RescheduleRequest | null> {
  const allowed = await checkRateLimit(`reschedule:${requesterId}`, 5, 15);
  if (!allowed) {
    logError('[Reschedule] requestReschedule', 'Rate limit exceeded');
    return null;
  }

  const { data, error } = await supabase
    .from('reschedule_requests')
    .insert({
      meeting_id: meetingId,
      conversation_id: conversationId,
      requester_id: requesterId,
      proposed_at: proposedAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    logError('[Reschedule] Failed to create request', error.message);
    return null;
  }

  const dateStr = proposedAt.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  await sendBotMessage(
    conversationId,
    `${requesterName} has requested to reschedule the call to ${dateStr}. The other participant needs to approve or decline.`,
  );

  return data as RescheduleRequest;
}

export async function respondToReschedule(
  requestId: string,
  meetingId: string,
  conversationId: string,
  action: 'approved' | 'declined',
  proposedAt: Date,
  responderName: string,
): Promise<boolean> {
  const allowed = await checkRateLimit(`reschedule_respond:${requestId}`, 5, 15);
  if (!allowed) {
    logError('[Reschedule] respondToReschedule', 'Rate limit exceeded');
    return false;
  }
  const { error: updateError } = await supabase
    .from('reschedule_requests')
    .update({ status: action })
    .eq('id', requestId);

  if (updateError) {
    logError('[Reschedule] Failed to update request', updateError.message);
    return false;
  }

  if (action === 'approved') {
    const { error: meetingError } = await supabase
      .from('meetings')
      .update({ scheduled_at: proposedAt.toISOString() })
      .eq('id', meetingId);

    if (meetingError) {
      logError('[Reschedule] Failed to update meeting time', meetingError.message);
      return false;
    }

    const dateStr = proposedAt.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    await sendBotMessage(
      conversationId,
      `${responderName} approved the reschedule. The call is now set for ${dateStr}.`,
    );
    await sendBotMessage(
      conversationId,
      `Since the time has changed, please share an updated meeting link (Zoom, Google Meet, etc.) if the previous one is no longer valid. Tap the link icon on the meeting chip above to update it.`,
    );
  } else {
    await sendBotMessage(
      conversationId,
      `${responderName} declined the reschedule request. The original time stands.`,
    );
  }

  return true;
}

export async function updateMeetingLink(meetingId: string, link: string): Promise<boolean> {
  const allowed = await checkRateLimit(`meeting_link:${meetingId}`, 5, 15);
  if (!allowed) return false;
  const trimmed = link.trim();
  if ((!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) || trimmed.length > 500) {
    return false;
  }
  const { error } = await supabase
    .from('meetings')
    .update({ meeting_link: trimmed })
    .eq('id', meetingId);

  if (error) {
    logError('[Meetings] Failed to update link', error.message);
    return false;
  }
  return true;
}

export async function cancelReschedule(
  requestId: string,
  conversationId: string,
): Promise<boolean> {
  const allowed = await checkRateLimit(`cancel_reschedule:${requestId}`, 5, 15);
  if (!allowed) return false;
  const { error } = await supabase
    .from('reschedule_requests')
    .update({ status: 'declined' })
    .eq('id', requestId);

  if (error) {
    logError('[Reschedule] Failed to cancel request', error.message);
    return false;
  }

  await sendBotMessage(conversationId, 'The reschedule request was cancelled.');
  return true;
}

export async function requestReassignment(assignmentId: string): Promise<boolean> {
  const allowed = await checkRateLimit(`reassignment:${assignmentId}`, 3, 15);
  if (!allowed) {
    logError('[Assignments] requestReassignment', 'Rate limit exceeded');
    return false;
  }
  const { error } = await supabase
    .from('mentor_assignments')
    .update({ status: 'reassignment_requested' })
    .eq('id', assignmentId);

  if (error) {
    logError('[Assignments] Failed to request reassignment', error.message);
    return false;
  }
  return true;
}

// ─── Request a new mentor (student-initiated) ─────────────────
// Marks old assignment inactive, frees the mentor for new matches,
// then fires auto-assign-mentor to find a replacement.

export async function requestNewMentor(
  assignmentId: string,
  studentId: string,
): Promise<boolean> {
  const allowed = await checkRateLimit(`new_mentor:${studentId}`, 3, 1440);
  if (!allowed) {
    logError('[Assignments] requestNewMentor', 'Rate limit exceeded');
    return false;
  }

  // Read mentor_id from DB and verify the student owns this assignment.
  // Never trust a client-supplied mentorId — prevents privilege escalation.
  const { data: assignment } = await supabase
    .from('mentor_assignments')
    .select('mentor_id')
    .eq('id', assignmentId)
    .eq('student_id', studentId)
    .eq('status', 'active')
    .maybeSingle();

  if (!assignment) {
    logError('[Assignments] requestNewMentor', 'Assignment not found or not owned by student');
    return false;
  }

  const { error } = await supabase
    .from('mentor_assignments')
    .update({ status: 'reassignment_requested' })
    .eq('id', assignmentId)
    .eq('student_id', studentId);

  if (error) {
    logError('[Assignments] requestNewMentor', error.message);
    return false;
  }

  // Make the old mentor available again for new student matches
  void supabase
    .from('mentor_profiles')
    .update({ is_available: true })
    .eq('id', assignment.mentor_id);

  // Fire-and-forget: find a new mentor for this student
  supabase.functions.invoke('auto-assign-mentor', {
    body: { studentId },
  }).catch(() => {});

  return true;
}
