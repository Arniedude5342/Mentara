-- ============================================================
-- Mentara Demo Account Seed Script
-- Run in Supabase SQL Editor (with service role / bypass RLS)
-- ============================================================
-- Creates two demo accounts for Apple App Review:
--   Student: reviewer+student@mentara.app  / MentaraReview2026!
--   Mentor:  reviewer+mentor@mentara.app   / MentaraReview2026!
--
-- The script is idempotent — safe to run multiple times.
-- ============================================================

-- ── 1. Create auth users (bypass RLS via service role) ─────────
-- NOTE: In Supabase Dashboard, go to Authentication > Users and
--       manually create these two users if this section fails.
--       Email: reviewer+student@mentara.app, Password: MentaraReview2026!
--       Email: reviewer+mentor@mentara.app,  Password: MentaraReview2026!
--       Then come back and run the rest of this script.
--
-- The UUIDs below are fixed so the rest of the script can reference them.

DO $$
DECLARE
  student_auth_id UUID := '10000000-0000-0000-0000-000000000001';
  mentor_auth_id  UUID := '10000000-0000-0000-0000-000000000002';
BEGIN
  -- Create student auth user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = student_auth_id) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data,
      aud, role, created_at, updated_at
    ) VALUES (
      student_auth_id,
      '00000000-0000-0000-0000-000000000000',
      'reviewer+student@mentara.app',
      crypt('MentaraReview2026!', gen_salt('bf')),
      NOW(),
      '{"role":"student","full_name":"Alex Rivera"}'::jsonb,
      'authenticated', 'authenticated',
      NOW(), NOW()
    );
  END IF;

  -- Create mentor auth user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = mentor_auth_id) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data,
      aud, role, created_at, updated_at
    ) VALUES (
      mentor_auth_id,
      '00000000-0000-0000-0000-000000000000',
      'reviewer+mentor@mentara.app',
      crypt('MentaraReview2026!', gen_salt('bf')),
      NOW(),
      '{"role":"mentor","full_name":"Dr. Priya Sharma"}'::jsonb,
      'authenticated', 'authenticated',
      NOW(), NOW()
    );
  END IF;
END $$;

-- ── 2. Profiles ────────────────────────────────────────────────

INSERT INTO profiles (id, email, full_name, avatar_url, role, bio, location, website, onboarding_complete, achievements, referral_code)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'reviewer+student@mentara.app',
  'Alex Rivera',
  'https://i.pravatar.cc/300?img=33',
  'student',
  'I''m a sophomore studying Computer Science at UCLA. I''m passionate about machine learning and want to break into AI research. Currently working on a computer vision project for my club.',
  'Los Angeles, CA',
  'https://github.com/alexrivera',
  true,
  ARRAY['first_session', 'voice_memo'],
  'ALEXDEMO'
),
(
  '10000000-0000-0000-0000-000000000002',
  'reviewer+mentor@mentara.app',
  'Dr. Priya Sharma',
  'https://i.pravatar.cc/300?img=47',
  'mentor',
  'I''m a Senior Research Scientist at Google DeepMind with 12 years of experience in machine learning and AI. I hold a PhD from Stanford in Computer Science. I love mentoring the next generation of AI researchers and helping students navigate the path from academia to industry.',
  'San Francisco, CA',
  'https://scholar.google.com/priyasharma',
  true,
  ARRAY[]::text[],
  'PRIYADEMO'
)
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      avatar_url = EXCLUDED.avatar_url,
      bio = EXCLUDED.bio,
      location = EXCLUDED.location,
      website = EXCLUDED.website,
      onboarding_complete = EXCLUDED.onboarding_complete,
      achievements = EXCLUDED.achievements;

-- ── 3. Student Profile ─────────────────────────────────────────

INSERT INTO student_profiles (id, grade_level, fields_of_interest, learning_goals, availability, preferred_communication)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'undergraduate',
  ARRAY['Computer Science', 'Artificial Intelligence', 'Data Science', 'Mathematics'],
  'I want to land a machine learning research internship at a top AI lab (DeepMind, OpenAI, or Google Brain) by next summer. I also want to publish my first research paper and improve my understanding of transformer architectures.',
  ARRAY['weekends', 'evenings'],
  ARRAY['video', 'chat']
)
ON CONFLICT (id) DO UPDATE
  SET fields_of_interest = EXCLUDED.fields_of_interest,
      learning_goals = EXCLUDED.learning_goals;

-- ── 4. Mentor Profile ──────────────────────────────────────────

INSERT INTO mentor_profiles (
  id, title, institution, fields_of_expertise, years_experience,
  availability, is_free, rating, review_count, verified,
  verification_status, linkedin_url, preferred_student_levels,
  mentoring_style, languages
)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  'Senior Research Scientist',
  'Google DeepMind',
  ARRAY['Artificial Intelligence', 'Machine Learning', 'Computer Science', 'Data Science', 'Mathematics'],
  12,
  ARRAY['weekends', 'evenings', 'weekdays'],
  true,
  4.9,
  47,
  true,
  'verified',
  'https://linkedin.com/in/priya-sharma-phd',
  ARRAY['undergraduate', 'graduate', 'phd'],
  'I use the Socratic method — I guide you to find answers rather than handing them to you. Each session starts with reviewing your progress on action items from the last session, then deep-diving into whatever is blocking you. I prioritize building your intuition over memorizing facts.',
  ARRAY['English', 'Hindi']
)
ON CONFLICT (id) DO UPDATE
  SET title = EXCLUDED.title,
      institution = EXCLUDED.institution,
      fields_of_expertise = EXCLUDED.fields_of_expertise,
      rating = EXCLUDED.rating,
      review_count = EXCLUDED.review_count,
      verified = EXCLUDED.verified,
      verification_status = EXCLUDED.verification_status;

-- ── 5. Mentor Assignment ───────────────────────────────────────

INSERT INTO mentor_assignments (
  id, student_id, mentor_id, status, assigned_field,
  assigned_by, assignment_reasoning
)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'active',
  'Artificial Intelligence',
  'ai',
  'Dr. Sharma''s 12 years in ML research at DeepMind is a near-perfect match for Alex''s goal of breaking into AI research. Her background in transformer architectures directly addresses Alex''s stated learning goal, and her preference for undergraduate students aligns perfectly.'
)
ON CONFLICT (id) DO NOTHING;

-- ── 6. Conversation ───────────────────────────────────────────

INSERT INTO conversations (id, student_id, mentor_id, last_message, last_message_at, student_unread, mentor_unread)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'See you next month! Keep working on that attention mechanism implementation.',
  NOW() - INTERVAL '2 days',
  0, 0
)
ON CONFLICT (id) DO NOTHING;

-- Update mentor_assignments with conversation_id
UPDATE mentor_assignments
SET conversation_id = '30000000-0000-0000-0000-000000000001'
WHERE id = '20000000-0000-0000-0000-000000000001';

-- ── 7. Messages (rich conversation history) ───────────────────

-- Helper: insert messages without triggering unread counter
-- (we set final unread to 0 on the conversation directly above)

INSERT INTO messages (id, conversation_id, sender_id, content, created_at)
VALUES
  -- Week 1: Introduction
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Hi Dr. Sharma! I''m so excited to be matched with you. I''ve read several of your papers on attention mechanisms and I''m hoping to learn from you this semester.',
   NOW() - INTERVAL '45 days'),

  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',
   'Hi Alex! Great to meet you. I loved your application — your computer vision project shows real initiative. Let''s schedule our first call to understand your goals better. When are you free this week?',
   NOW() - INTERVAL '44 days 22 hours'),

  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'I''m free Saturday afternoon or Sunday evening! I''ve prepared a list of questions about getting into AI research.',
   NOW() - INTERVAL '44 days 20 hours'),

  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',
   'Saturday 3pm PST works for me. Come prepared to tell me about your current ML knowledge and what specific problems you want to solve. See you then!',
   NOW() - INTERVAL '44 days 18 hours'),

  -- Bot message after first message
  ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001',
   NULL,
   '👋 Great start! I''ve noticed you''ve connected — your first monthly call is the most important step. Use it to share your goals and build rapport. I''ll remind you a day before your scheduled call.',
   NOW() - INTERVAL '44 days 17 hours'),

  -- After first session
  ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'That call was incredible! I had no idea about the difference between research engineering and pure research roles. The internship application timeline you shared is super helpful.',
   NOW() - INTERVAL '38 days'),

  ('40000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',
   'I''m glad it was useful! Remember the three things I asked you to do before our next call: (1) read the Attention Is All You Need paper, (2) implement a basic transformer from scratch, (3) draft a 1-page research interest statement.',
   NOW() - INTERVAL '37 days 22 hours'),

  ('40000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Got it! I started reading the Vaswani et al. paper. Quick question — do you recommend implementing in PyTorch or TensorFlow for a first attempt?',
   NOW() - INTERVAL '35 days'),

  ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',
   'PyTorch for research, always. TF is for production at scale. The research community has standardized on PyTorch — every paper you read will have PyTorch implementations. Start there.',
   NOW() - INTERVAL '34 days 23 hours'),

  -- Session 2 follow-up
  ('40000000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Just finished implementing the multi-head attention mechanism! It was hard but I finally got it working on a toy dataset. I''ll share the GitHub link before our call.',
   NOW() - INTERVAL '20 days'),

  ('40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',
   'That''s fantastic progress Alex! Make sure to add detailed comments explaining your understanding of why each step works — that understanding is what reviewers will quiz you on in interviews.',
   NOW() - INTERVAL '19 days 20 hours'),

  -- Bot AI nudge
  ('40000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000001',
   NULL,
   '📅 Your next monthly call with Dr. Sharma is coming up! She''s reviewed 3 of your recent commits. Have you thought about what specific feedback you want from her on your transformer implementation?',
   NOW() - INTERVAL '15 days'),

  -- Most recent exchange
  ('40000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Dr. Sharma — I just submitted my application to the Google DeepMind summer internship! I used the research statement draft you reviewed last month.',
   NOW() - INTERVAL '5 days'),

  ('40000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',
   'Amazing!! That took courage. The internship application season is competitive but your project and statement are strong. I put in a good word with the recruiting team. Check your email — I cc''d you.',
   NOW() - INTERVAL '4 days 23 hours'),

  ('40000000-0000-0000-0000-000000000015', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'I can''t believe it — I just got an email saying I''ve been shortlisted for an interview!! Thank you so much. I wouldn''t have made it this far without you.',
   NOW() - INTERVAL '2 days 12 hours'),

  ('40000000-0000-0000-0000-000000000016', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',
   'You did the work — I just pointed the way. Let''s prep for the interview in our next call. Bring your transformer code and be ready to walk me through every design decision. See you next month!',
   NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- ── 8. Past Meetings ──────────────────────────────────────────

INSERT INTO meetings (
  id, conversation_id, student_id, mentor_id, platform, meeting_link,
  scheduled_at, is_first_meeting, occurred, student_notes, mentor_notes
)
VALUES
  -- Session 1 (first meeting, occurred)
  (
    '50000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'google_meet',
    'https://meet.google.com/demo-first-session',
    NOW() - INTERVAL '40 days',
    true,
    true,
    'Key takeaways: Research Engineering vs Pure Research are two very different career paths. For internships, apply in Sep-Oct for summer. Build 2-3 strong projects > many weak ones. Read: Attention Is All You Need. Draft research interest statement. Implement transformer from scratch.',
    'Alex has strong fundamentals and good intuition. Recommended: (1) transformer implementation, (2) internship applications Sep-Oct, (3) research interest statement. Next session: review implementation and refine research focus.'
  ),
  -- Session 2 (occurred)
  (
    '50000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'google_meet',
    'https://meet.google.com/demo-second-session',
    NOW() - INTERVAL '12 days',
    false,
    true,
    'Walked through my transformer implementation with Dr. Sharma. She pointed out my positional encoding was wrong — I was using absolute instead of relative. Fixed it. She also reviewed my research statement and suggested making my "why AI" section more specific. Big insight: internship interviews at research labs focus on fundamentals + one deep area, not breadth.',
    'Alex''s implementation is solid — fixed positional encoding bug during session. Research statement is 80% there; needs a stronger personal motivation paragraph. Shortlisted Alex to our recruiting team for summer internship consideration. Next: interview prep, transformer optimization techniques.'
  )
ON CONFLICT (id) DO NOTHING;

-- ── 9. Post-Meeting Ratings ───────────────────────────────────

INSERT INTO post_meeting_ratings (id, meeting_id, rater_id, ratee_id, rating, notes)
VALUES
  -- Student rated mentor for session 1
  (
    '60000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    5,
    'Dr. Sharma gave me more clarity in 45 minutes than I''ve gotten from months of googling. The breakdown of research vs engineering paths was exactly what I needed.'
  ),
  -- Mentor rated student for session 1
  (
    '60000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    5,
    'Alex came fully prepared with focused questions. High initiative — completed the pre-reading. Strong candidate for the internship pipeline.'
  ),
  -- Student rated mentor for session 2
  (
    '60000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    5,
    'She reviewed my entire transformer codebase line by line. The positional encoding fix alone would have taken me weeks to figure out on my own. Incredible session.'
  )
ON CONFLICT (id) DO NOTHING;

-- ── 10. Upcoming Meeting (scheduled far in the future) ─────────

INSERT INTO meetings (
  id, conversation_id, student_id, mentor_id, platform, meeting_link,
  scheduled_at, is_first_meeting, occurred
)
VALUES (
  '50000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'google_meet',
  'https://meet.google.com/abc-defg-hij',
  NOW() + INTERVAL '14 days',
  false,
  false
)
ON CONFLICT (id) DO NOTHING;

-- ── 11. Reviews (from student on mentor) ─────────────────────

INSERT INTO reviews (id, student_id, mentor_id, rating, comment)
VALUES (
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  5,
  'Dr. Sharma is everything a mentor should be. In two sessions she helped me get shortlisted for a DeepMind internship, fix critical bugs in my ML implementation, and gave my research statement a complete overhaul. She challenges you to think, not just follow instructions. 10/10 would recommend to every CS student serious about ML research.'
)
ON CONFLICT (id) DO NOTHING;

-- ── 12. Action Items (commitments from session) ───────────────
-- Requires action_items table from migration 20260514000000

INSERT INTO action_items (id, conversation_id, created_by, content, due_date, completed, completed_at)
VALUES
  (
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'Optimize transformer implementation: add gradient checkpointing and mixed precision training',
    (NOW() + INTERVAL '7 days')::date,
    false,
    NULL
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Prepare 10-minute presentation on positional encoding variants for next session',
    (NOW() + INTERVAL '10 days')::date,
    false,
    NULL
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'Read "Language Models are Few-Shot Learners" (GPT-3 paper) and summarize key ideas',
    (NOW() - INTERVAL '5 days')::date,
    true,
    NOW() - INTERVAL '3 days'
  )
ON CONFLICT (id) DO NOTHING;

-- ── 13. Student Goals ─────────────────────────────────────────

INSERT INTO student_goals (id, student_id, title, description, target_date, status, sort_order)
VALUES
  (
    '90000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Land a ML Research Internship',
    'Apply to DeepMind, OpenAI, Google Brain, and Meta AI for summer 2026. Shortlisted for DeepMind interview!',
    (NOW() + INTERVAL '60 days')::date,
    'active',
    0
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Implement Transformer from Scratch',
    'Complete PyTorch implementation of the full Attention Is All You Need architecture with positional encoding, multi-head attention, and feed-forward layers.',
    (NOW() - INTERVAL '5 days')::date,
    'completed',
    1
  ),
  (
    '90000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Publish First Research Paper',
    'Write and submit a paper on computer vision + transformer architectures to a workshop at NeurIPS or ICML.',
    (NOW() + INTERVAL '120 days')::date,
    'active',
    2
  )
ON CONFLICT (id) DO NOTHING;

-- ── Done ──────────────────────────────────────────────────────
-- Apple App Review Credentials:
--
-- Student Login:
--   Email: reviewer+student@mentara.app
--   Password: MentaraReview2026!
--
-- Mentor Login:
--   Email: reviewer+mentor@mentara.app
--   Password: MentaraReview2026!
--
-- What to explore as the student:
--   - Home tab: goal map, voice memo reflections, achievement badges, referral invite
--   - Messages tab: pre-populated conversation with Dr. Sharma
--   - Chat screen: text messages, bot messages, upcoming meeting chip,
--                  action items card, past meeting with notes,
--                  long-press on message to report
--   - Profile tab: achievements, referral code, invite list
--   - Discover tab: matched mentor profile
--
-- What to explore as the mentor:
--   - Home tab: student card, upcoming call countdown, profile completeness
--   - Messages tab: conversation with Alex
--   - Chat screen: same rich history + report/block via "..." button
