export type UserRole = 'student' | 'mentor';

export interface Profile {
  id: string;
  // Lives in the owner-only `private_profiles` table, not on the public
  // `profiles` row. Only populated for the signed-in user's own profile.
  email?: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  bio: string | null;
  location: string | null;
  website: string | null;
  onboarding_complete: boolean;
  signup_source: 'app' | 'web' | null;
  referral_code: string | null;
  referred_by: string | null;
  achievements: string[];
  created_at: string;
  updated_at: string;
}

export interface StudentProfile {
  id: string;
  grade_level: string | null;
  fields_of_interest: string[];
  learning_goals: string | null;
  availability: string[];
  preferred_communication: string[];
  created_at: string;
  updated_at: string;
}

export interface MentorProfile {
  id: string;
  title: string | null;
  institution: string | null;
  fields_of_expertise: string[];
  years_experience: number;
  availability: string[];
  hourly_rate: number;
  is_free: boolean;
  rating: number | null; // NULL until a review exists
  review_count: number;
  rating_sum: number;
  review_count_actual: number;
  is_available: boolean;
  verified: boolean;
  verification_status: 'pending' | 'verified' | 'rejected';
  linkedin_url: string | null;
  preferred_student_levels: string[];
  mentoring_style: string | null;
  languages: string[];
  max_students: number | null;
  created_at: string;
  updated_at: string;
  // Joined from profiles table via getMentorById
  profile?: Profile | null;
}

export interface MentorWithProfile {
  profile: Profile;
  mentor: MentorProfile;
  is_favorited?: boolean;
}

export interface Conversation {
  id: string;
  student_id: string;
  mentor_id: string;
  last_message: string | null;
  last_message_at: string;
  student_unread: number;
  mentor_unread: number;
  created_at: string;
  other_user?: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null; // null for bot messages
  sender_type: 'human' | 'bot';
  content: string;
  created_at: string;
  read_at: string | null;
}

export interface MentorAssignment {
  id: string;
  student_id: string;
  mentor_id: string;
  assigned_field: string;
  assigned_by: 'ai' | 'admin';
  conversation_id: string | null;
  status: 'active' | 'completed' | 'reassignment_requested';
  assignment_reasoning: string | null;
  created_at: string;
  updated_at: string;
  other_user?: Profile; // joined mentor (for student view) or student (for mentor view)
}

export interface Meeting {
  id: string;
  conversation_id: string;
  student_id: string;
  mentor_id: string;
  scheduled_by: string | null;
  platform: 'zoom' | 'google_meet' | 'teams' | 'facetime' | 'other';
  meeting_link: string | null;
  scheduled_at: string;
  check_in_sent_at: string | null;
  confirmation_sent_at: string | null;
  occurred: boolean | null;
  student_notes: string | null;
  mentor_notes: string | null;
  is_first_meeting: boolean;
  invite_status: 'pending' | 'confirmed' | 'declined';
  created_at: string;
  updated_at: string;
}

export interface RescheduleRequest {
  id: string;
  meeting_id: string;
  conversation_id: string;
  requester_id: string;
  proposed_at: string;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
}

export interface PostMeetingRating {
  id: string;
  meeting_id: string;
  rater_id: string;
  ratee_id: string;
  rating: number | null;
  notes: string | null;
  had_problems: boolean;
  problem_details: string | null;
  created_at: string;
}

export interface ActionItem {
  id: string;
  conversation_id: string;
  created_by: string;
  content: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentGoal {
  id: string;
  student_id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: 'active' | 'completed';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VoiceMemo {
  id: string;
  meeting_id: string;
  student_id: string;
  conversation_id: string;
  audio_url: string;
  transcript: string | null;
  ai_insight: string | null;
  ai_action_item: string | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}
