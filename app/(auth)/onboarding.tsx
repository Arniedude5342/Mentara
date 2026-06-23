import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/context/AuthContext';
import Button from '@/components/ui/Button';
import {
  Colors, Radius, Shadow, FIELDS_OF_EXPERTISE, AVAILABILITY_OPTIONS,
} from '@/constants/theme';
import { updateProfile, upsertStudentProfile, upsertMentorProfile, applyReferralCode, triggerAutoAssignMentor, triggerAutoVerifyMentor } from '@/lib/supabase';
import { getMyAssignment } from '@/lib/meetings';

// Step 0 is always the age gate (both roles). Step 1 is welcome. Steps 2+ are role-specific.
const TOTAL_STUDENT_STEPS = 6;
const TOTAL_MENTOR_STEPS = 8;

const GRADE_LEVELS = [
  { value: 'high_school', label: 'High School' },
  { value: 'undergrad', label: 'Undergraduate' },
  { value: 'graduate', label: 'Graduate' },
  { value: 'phd', label: 'PhD' },
  { value: 'early_career', label: 'Early Career' },
  { value: 'other', label: 'Other' },
] as const;

type GradeLevel = typeof GRADE_LEVELS[number]['value'];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile, loading: authLoading, signOut } = useAuth();

  // All hooks declared unconditionally at the top — Rules of Hooks
  const [retrying, setRetrying] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [gradeLevel, setGradeLevel] = useState<GradeLevel | null>(null);
  const [fieldsOfInterest, setFieldsOfInterest] = useState<string[]>([]);
  const [learningGoals, setLearningGoals] = useState('');
  const [availability, setAvailability] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [institution, setInstitution] = useState('');
  const [fieldsOfExpertise, setFieldsOfExpertise] = useState<string[]>([]);
  const [preferredStudentLevels, setPreferredStudentLevels] = useState<string[]>([]);
  const [yearsExp, setYearsExp] = useState('');
  const [mentorAvailability, setMentorAvailability] = useState<string[]>([]);
  const [mentoringStyle, setMentoringStyle] = useState('');
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [ageBracket, setAgeBracket] = useState<'adult' | 'minor' | null>(null);
  const [guardianConsent, setGuardianConsent] = useState(false);

  const handleRetryProfile = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await refreshProfile();
    } finally {
      setRetrying(false);
    }
  };

  if (authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Profile load failed (DB trigger may have raced or network blip).
  // Give the user an escape hatch instead of freezing the screen forever.
  if (!profile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, padding: 32, gap: 14 }}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.gray400} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.dark, textAlign: 'center' }}>
          Setting up your account…
        </Text>
        <Text style={{ fontSize: 14, color: Colors.gray500, textAlign: 'center', lineHeight: 20 }}>
          We could not load your profile. Tap retry, or sign out and try again.
        </Text>
        <Button
          title={retrying ? 'Retrying…' : 'Retry'}
          onPress={handleRetryProfile}
          loading={retrying}
        />
        <TouchableOpacity onPress={() => signOut()} accessibilityRole="button" accessibilityLabel="Sign out">
          <Text style={{ fontSize: 13, color: Colors.gray500, textDecorationLine: 'underline' }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isStudent = profile.role === 'student';
  const totalSteps = isStudent ? TOTAL_STUDENT_STEPS : TOTAL_MENTOR_STEPS;
  const roleColor = isStudent ? Colors.primary : Colors.accent2;
  const roleLightColor = isStudent ? Colors.primaryLight : Colors.accent2Light;


  const toggleField = (arr: string[], set: (v: string[]) => void, val: string) => {
    set(arr.includes(val) ? arr.filter((f) => f !== val) : [...arr, val]);
  };

  const goNext = () => {
    // Step 0: age gate — no user action needed (button disabled if underage, handled in AgeGateStep)
    if (step === 1) {
      // Welcome step — ToS must be accepted
      if (!tosAccepted) {
        Alert.alert('Terms Required', 'Please accept the Terms of Service and Privacy Policy to continue.');
        return;
      }
    }
    if (isStudent) {
      // Step 2: bio + location (shifted by 2 from old step 1)
      if (step === 2) {
        if (!bio.trim()) { Alert.alert('Required', 'Please write a short bio before continuing.'); return; }
        if (!location.trim()) { Alert.alert('Required', 'Please enter your location before continuing.'); return; }
      }
      // Step 3: grade level
      if (step === 3 && !gradeLevel) {
        Alert.alert('Required', 'Please select your education level before continuing.');
        return;
      }
      // Step 4: fields of interest
      if (step === 4 && fieldsOfInterest.length === 0) {
        Alert.alert('Required', 'Please select at least one field of interest.');
        return;
      }
    } else {
      // Mentor step 2: bio + location
      if (step === 2) {
        if (!bio.trim()) { Alert.alert('Required', 'Please write a professional bio before continuing.'); return; }
        if (!location.trim()) { Alert.alert('Required', 'Please enter your location before continuing.'); return; }
      }
      // Mentor step 3: title + institution + years
      if (step === 3) {
        if (!title.trim()) { Alert.alert('Required', 'Please enter your professional title.'); return; }
        if (!institution.trim()) { Alert.alert('Required', 'Please enter your institution or company.'); return; }
        if (!yearsExp.trim()) { Alert.alert('Required', 'Please enter your years of experience.'); return; }
      }
      // Mentor step 4: LinkedIn URL verification
      if (step === 4) {
        const url = linkedInUrl.trim();
        if (!url) { Alert.alert('Required', 'Please enter your LinkedIn profile URL.'); return; }
        const isValidLinkedIn = /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?$/.test(url);
        if (!isValidLinkedIn) { Alert.alert('Invalid URL', 'Please enter a valid LinkedIn profile URL, e.g. https://linkedin.com/in/yourname'); return; }
      }
      // Mentor step 5: fields of expertise
      if (step === 5 && fieldsOfExpertise.length === 0) {
        Alert.alert('Required', 'Please select at least one area of expertise.');
        return;
      }
    }
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleFinish = async () => {
    if (!user) return;
    if (isStudent) {
      if (!learningGoals.trim()) { Alert.alert('Required', 'Please share your learning goals before finishing.'); return; }
      if (availability.length === 0) { Alert.alert('Required', 'Please select at least one availability option.'); return; }
    } else {
      if (!mentoringStyle.trim()) { Alert.alert('Required', 'Please describe your mentoring style before finishing.'); return; }
      if (mentorAvailability.length === 0) { Alert.alert('Required', 'Please select at least one availability option.'); return; }
    }
    setLoading(true);
    try {
      await updateProfile(user.id, {
        bio: bio.trim(),
        location: location.trim(),
        onboarding_complete: true,
        guardian_consent_at: ageBracket === 'minor' ? new Date().toISOString() : null,
      });

      // Apply any pending referral code (captured from deep link before registration)
      try {
        const pendingRef = await SecureStore.getItemAsync('mentara_pending_referral');
        if (pendingRef) {
          await applyReferralCode(pendingRef, user.id);
          await SecureStore.deleteItemAsync('mentara_pending_referral');
        }
      } catch {}

      if (isStudent) {
        await upsertStudentProfile(user.id, {
          grade_level: gradeLevel ?? 'other',
          fields_of_interest: fieldsOfInterest,
          learning_goals: learningGoals,
          availability,
        });
        // Only trigger auto-assign on first completion; skip if student already has an active mentor
        const existingAssignment = await getMyAssignment(user.id, 'student');
        if (!existingAssignment) {
          triggerAutoAssignMentor(user.id)
            .catch((err: any) => console.warn('[onboarding] auto-assign-mentor failed:', err));
        }
      } else {
        await upsertMentorProfile(user.id, {
          title,
          institution,
          fields_of_expertise: fieldsOfExpertise,
          preferred_student_levels: preferredStudentLevels,
          years_experience: parseInt(yearsExp) || 0,
          availability: mentorAvailability,
          mentoring_style: mentoringStyle,
          linkedin_url: linkedInUrl.trim(),
          is_free: true,
        });
        // Fire-and-forget: AI verifies profile and auto-approves/rejects
        triggerAutoVerifyMentor(user.id)
          .catch((err: any) => console.warn('[onboarding] auto-verify-mentor failed:', err));
      }
      await refreshProfile();
      router.replace('/(app)/(tabs)/home');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const studentSteps = [
    // Step 0: Age gate
    <AgeGateStep
      key="age"
      bracket={ageBracket}
      onPickBracket={setAgeBracket}
      guardianConsent={guardianConsent}
      onConsentChange={setGuardianConsent}
      onBlock={() => Alert.alert('Age Requirement', 'Mentara is for users 13 and older.', [{ text: 'OK' }])}
    />,

    // Step 1: Welcome + ToS
    <WelcomeStep key="welcome" isStudent name={profile?.full_name} tosAccepted={tosAccepted} onTosChange={setTosAccepted} />,

    // Step 2: Bio
    <View key="bio" style={styles.stepContent}>
      <StepHeader
        title="Tell us about yourself"
        subtitle="Write a short bio to help mentors understand who you are."
        icon="person-circle-outline"
        color={roleColor} bg={roleLightColor}
      />
      <TextInput
        style={styles.textarea}
        value={bio}
        onChangeText={setBio}
        placeholder="I'm a sophomore studying computer science. I'm passionate about AI and want to build impactful products..."
        placeholderTextColor={Colors.gray400}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        maxLength={500}
        accessibilityLabel="Bio"
      />
      <Text style={styles.charCount}>{bio.length}/500</Text>
      <TextInput
        style={styles.input}
        value={location}
        onChangeText={setLocation}
        placeholder="Your location (e.g. New York, NY)"
        placeholderTextColor={Colors.gray400}
        accessibilityLabel="Location"
      />
    </View>,

    // Step 2: Education level
    <View key="grade" style={styles.stepContent}>
      <StepHeader
        title="What's your education level?"
        subtitle="This helps us match you with the right mentor."
        icon="school-outline"
        color={roleColor} bg={roleLightColor}
      />
      <View style={styles.optionGrid}>
        {GRADE_LEVELS.map((g) => (
          <TouchableOpacity
            key={g.value}
            style={[
              styles.optionChip,
              gradeLevel === g.value && { borderColor: roleColor, backgroundColor: roleColor },
            ]}
            onPress={() => setGradeLevel(g.value)}
            accessibilityLabel={g.label}
            accessibilityRole="button"
          >
            <Text style={[styles.optionChipText, gradeLevel === g.value && { color: Colors.white }]}>
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>,

    // Step 3: Fields of interest
    <View key="fields" style={styles.stepContent}>
      <StepHeader
        title="What fields interest you?"
        subtitle="Select all that apply. We'll find mentors who match."
        icon="compass-outline"
        color={roleColor} bg={roleLightColor}
      />
      <ScrollView style={styles.fieldScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.fieldGrid}>
          {FIELDS_OF_EXPERTISE.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.fieldChip, fieldsOfInterest.includes(f) && { borderColor: roleColor, backgroundColor: roleLightColor }]}
              onPress={() => toggleField(fieldsOfInterest, setFieldsOfInterest, f)}
              accessibilityLabel={fieldsOfInterest.includes(f) ? `Remove ${f}` : `Add ${f}`}
              accessibilityRole="button"
            >
              <Text style={[styles.fieldChipText, fieldsOfInterest.includes(f) && { color: roleColor, fontWeight: '700' as const }]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>,

    // Step 4: Goals & availability
    <View key="goals" style={styles.stepContent}>
      <StepHeader
        title="What are your learning goals?"
        subtitle="Share what you want to achieve through mentorship."
        icon="flag-outline"
        color={roleColor} bg={roleLightColor}
      />
      <TextInput
        style={styles.textarea}
        value={learningGoals}
        onChangeText={setLearningGoals}
        placeholder="I want to break into machine learning, build a portfolio, and land an internship at a top tech company..."
        placeholderTextColor={Colors.gray400}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        maxLength={400}
        accessibilityLabel="Learning goals"
      />
      <Text style={styles.sectionSubLabel}>When are you available?</Text>
      <View style={styles.optionGrid}>
        {AVAILABILITY_OPTIONS.map((a) => (
          <TouchableOpacity
            key={a.value}
            style={[styles.optionChip, availability.includes(a.value) && { borderColor: roleColor, backgroundColor: roleColor }]}
            onPress={() => toggleField(availability, setAvailability, a.value)}
            accessibilityLabel={a.label}
            accessibilityRole="button"
          >
            <Text style={[styles.optionChipText, availability.includes(a.value) && { color: Colors.white }]}>
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>,
  ];

  const mentorSteps = [
    // Step 0: Age gate
    <AgeGateStep
      key="age"
      bracket={ageBracket}
      onPickBracket={setAgeBracket}
      guardianConsent={guardianConsent}
      onConsentChange={setGuardianConsent}
      onBlock={() => Alert.alert('Age Requirement', 'Mentara is for users 13 and older.', [{ text: 'OK' }])}
    />,

    // Step 1: Welcome + ToS
    <WelcomeStep key="welcome" isStudent={false} name={profile?.full_name} tosAccepted={tosAccepted} onTosChange={setTosAccepted} />,

    // Step 2: Bio
    <View key="bio" style={styles.stepContent}>
      <StepHeader title="Your professional bio" subtitle="Tell students about your background and passion for mentoring." icon="person-circle-outline" color={roleColor} bg={roleLightColor} />
      <TextInput
        style={styles.textarea}
        value={bio}
        onChangeText={setBio}
        placeholder="I'm a professor of Computer Science at Stanford. I specialize in distributed systems and love helping students navigate the path to a research career..."
        placeholderTextColor={Colors.gray400}
        multiline numberOfLines={5} textAlignVertical="top" maxLength={600}
        accessibilityLabel="Professional bio"
      />
      <Text style={styles.charCount}>{bio.length}/600</Text>
      <TextInput
        style={styles.input}
        value={location}
        onChangeText={setLocation}
        placeholder="Location (e.g. Palo Alto, CA)"
        placeholderTextColor={Colors.gray400}
        accessibilityLabel="Location"
      />
    </View>,

    // Title & institution
    <View key="role" style={styles.stepContent}>
      <StepHeader title="Your professional role" subtitle="This appears on your public mentor profile." icon="briefcase-outline" color={roleColor} bg={roleLightColor} />
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Title (e.g. Professor, Senior Engineer, VP of Product)"
        placeholderTextColor={Colors.gray400}
        accessibilityLabel="Professional title"
      />
      <TextInput
        style={[styles.input, { marginTop: 12 }]}
        value={institution}
        onChangeText={setInstitution}
        placeholder="Institution (e.g. MIT, Google, McKinsey)"
        placeholderTextColor={Colors.gray400}
        accessibilityLabel="Institution or company"
      />
      <TextInput
        style={[styles.input, { marginTop: 12 }]}
        value={yearsExp}
        onChangeText={(v) => setYearsExp(v.replace(/\D/g, ''))}
        placeholder="Years of experience"
        placeholderTextColor={Colors.gray400}
        keyboardType="numeric"
        accessibilityLabel="Years of experience"
      />
    </View>,

    // LinkedIn verification
    <View key="linkedin" style={styles.stepContent}>
      <StepHeader title="Verify your credentials" subtitle="Your LinkedIn profile helps students trust you and lets our team verify your background before you're matched." icon="logo-linkedin" color={roleColor} bg={roleLightColor} />
      <TextInput
        style={styles.input}
        value={linkedInUrl}
        onChangeText={setLinkedInUrl}
        placeholder="https://linkedin.com/in/yourname"
        placeholderTextColor={Colors.gray400}
        autoCapitalize="none"
        keyboardType="url"
        accessibilityLabel="LinkedIn profile URL"
      />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingTop: 4 }}>
        <Ionicons name="shield-checkmark-outline" size={16} color={Colors.gray400} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 12, color: Colors.gray400, lineHeight: 18 }}>
          Your profile will be reviewed by our team before you're matched with students. This usually takes less than 24 hours.
        </Text>
      </View>
    </View>,

    // Expertise
    <View key="expertise" style={styles.stepContent}>
      <StepHeader title="Areas of expertise" subtitle="Select your fields. Students will discover you through these." icon="star-outline" color={roleColor} bg={roleLightColor} />
      <ScrollView style={styles.fieldScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.fieldGrid}>
          {FIELDS_OF_EXPERTISE.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.fieldChip, fieldsOfExpertise.includes(f) && { borderColor: roleColor, backgroundColor: roleLightColor }]}
              onPress={() => toggleField(fieldsOfExpertise, setFieldsOfExpertise, f)}
              accessibilityLabel={fieldsOfExpertise.includes(f) ? `Remove ${f}` : `Add ${f}`}
              accessibilityRole="button"
            >
              <Text style={[styles.fieldChipText, fieldsOfExpertise.includes(f) && { color: roleColor, fontWeight: '700' as const }]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>,

    // Preferred student levels
    <View key="levels" style={styles.stepContent}>
      <StepHeader title="Who do you prefer to mentor?" subtitle="Select the student levels you're best suited to guide. Leave blank for any." icon="people-outline" color={roleColor} bg={roleLightColor} />
      <View style={styles.optionGrid}>
        {GRADE_LEVELS.map((g) => (
          <TouchableOpacity
            key={g.value}
            style={[
              styles.optionChip,
              preferredStudentLevels.includes(g.value) && { borderColor: roleColor, backgroundColor: roleColor },
            ]}
            onPress={() => toggleField(preferredStudentLevels, setPreferredStudentLevels, g.value)}
            accessibilityLabel={g.label}
            accessibilityRole="button"
          >
            <Text style={[styles.optionChipText, preferredStudentLevels.includes(g.value) && { color: Colors.white }]}>
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>,

    // Style & availability
    <View key="style" style={styles.stepContent}>
      <StepHeader title="Your mentoring style" subtitle="Help students know what to expect from working with you." icon="chatbubbles-outline" color={roleColor} bg={roleLightColor} />
      <TextInput
        style={styles.textarea}
        value={mentoringStyle}
        onChangeText={setMentoringStyle}
        placeholder="I prefer Socratic discussions and hands-on project reviews. I'll help you develop your thinking rather than give you the answers directly..."
        placeholderTextColor={Colors.gray400}
        multiline numberOfLines={4} textAlignVertical="top" maxLength={400}
        accessibilityLabel="Mentoring style"
      />
      <Text style={styles.sectionSubLabel}>Your availability</Text>
      <View style={styles.optionGrid}>
        {AVAILABILITY_OPTIONS.map((a) => (
          <TouchableOpacity
            key={a.value}
            style={[styles.optionChip, mentorAvailability.includes(a.value) && { borderColor: roleColor, backgroundColor: roleColor }]}
            onPress={() => toggleField(mentorAvailability, setMentorAvailability, a.value)}
            accessibilityLabel={a.label}
            accessibilityRole="button"
          >
            <Text style={[styles.optionChipText, mentorAvailability.includes(a.value) && { color: Colors.white }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>,

  ];

  const steps = isStudent ? studentSteps : mentorSteps;
  const isLastStep = step === totalSteps - 1;
  const isAgeGate = step === 0;
  const isFirstStep = step === 1;
  const ageGateValid = ageBracket === 'adult' || (ageBracket === 'minor' && guardianConsent);
  const progress = (step + 1) / totalSteps;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Progress bar — hidden on age gate and welcome steps */}
      {!isAgeGate && !isFirstStep && (
        <View style={styles.progressContainer}>
          <TouchableOpacity
            onPress={goBack}
            style={styles.progressBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={20} color={Colors.gray700} />
          </TouchableOpacity>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: roleColor }]} />
          </View>
          <Text style={styles.progressText}>{step}/{totalSteps - 2}</Text>
        </View>
      )}

      <View style={styles.content}>
        {steps[step]}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {isAgeGate ? (
          <Button title="Continue" onPress={goNext} color={roleColor} disabled={!ageGateValid} />
        ) : isFirstStep ? (
          <Button
            title="Let's Get Started"
            onPress={goNext}
            color={roleColor}
            disabled={!tosAccepted}
          />
        ) : isLastStep ? (
          <Button
            title="Complete Setup"
            onPress={handleFinish}
            loading={loading}
            color={roleColor}
          />
        ) : (
          <Button title="Continue" onPress={goNext} color={roleColor} />
        )}
      </View>
    </View>
  );
}

function AgeGateStep({
  bracket, onPickBracket, guardianConsent, onConsentChange, onBlock,
}: {
  bracket: 'adult' | 'minor' | null;
  onPickBracket: (b: 'adult' | 'minor') => void;
  guardianConsent: boolean;
  onConsentChange: (v: boolean) => void;
  onBlock: () => void;
}) {
  return (
    <View style={styles.ageGateRoot}>
      <View style={styles.ageGateIcon}>
        <Ionicons name="person-outline" size={44} color={Colors.primary} />
      </View>
      <Text style={styles.ageGateTitle}>Before we begin</Text>
      <Text style={styles.ageGateSub}>
        Mentara connects students with professional mentors. You must be 13 or older to use this app.
      </Text>

      <View style={styles.ageBracketGroup}>
        <TouchableOpacity
          style={[styles.ageBracketBtn, bracket === 'adult' && styles.ageBracketBtnActive]}
          onPress={() => onPickBracket('adult')}
          accessibilityRole="button"
          accessibilityLabel="I am 18 or older"
        >
          <Ionicons name={bracket === 'adult' ? 'radio-button-on' : 'radio-button-off'} size={20} color={bracket === 'adult' ? Colors.primary : Colors.gray400} />
          <Text style={styles.ageBracketText}>I am 18 or older</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ageBracketBtn, bracket === 'minor' && styles.ageBracketBtnActive]}
          onPress={() => onPickBracket('minor')}
          accessibilityRole="button"
          accessibilityLabel="I am 13 to 17"
        >
          <Ionicons name={bracket === 'minor' ? 'radio-button-on' : 'radio-button-off'} size={20} color={bracket === 'minor' ? Colors.primary : Colors.gray400} />
          <Text style={styles.ageBracketText}>I am 13–17</Text>
        </TouchableOpacity>
      </View>

      {bracket === 'minor' && (
        <TouchableOpacity
          style={styles.consentRow}
          onPress={() => onConsentChange(!guardianConsent)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: guardianConsent }}
          accessibilityLabel="A parent or guardian has given me permission"
        >
          <View style={[styles.consentBox, guardianConsent && styles.consentBoxChecked]}>
            {guardianConsent && <Ionicons name="checkmark" size={14} color={Colors.white} />}
          </View>
          <Text style={styles.consentText}>
            A parent or guardian has given me permission to use Mentara and to communicate with mentors.
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.ageGateUnderLink}
        onPress={onBlock}
        accessibilityRole="button"
        accessibilityLabel="I am under 13"
      >
        <Text style={styles.ageGateUnderText}>I am under 13</Text>
      </TouchableOpacity>
    </View>
  );
}

function WelcomeStep({ isStudent, name, tosAccepted, onTosChange }: {
  isStudent: boolean;
  name?: string | null;
  tosAccepted: boolean;
  onTosChange: (v: boolean) => void;
}) {
  const gradColors = isStudent
    ? (['#083540', '#0D4F5C', '#1A7A8A'] as const)
    : (['#2C2520', '#5C2410', '#B8491A'] as const);
  const iconColor = isStudent ? Colors.primary : Colors.accent2;
  return (
    <LinearGradient colors={gradColors} style={styles.welcomeGrad}>
      <View style={styles.welcomeContent}>
        <View style={styles.welcomeIcon}>
          <Ionicons name={isStudent ? 'school' : 'medal'} size={48} color={iconColor} />
        </View>
        <Text style={styles.welcomeTitle}>
          Welcome{name ? `, ${name.split(' ')[0]}` : ''}! 👋
        </Text>
        <Text style={styles.welcomeSubtitle}>
          {isStudent
            ? "Let's set up your student profile so we can match you with the perfect mentors."
            : "Let's build your mentor profile so students can discover and connect with you."
          }
        </Text>
        <View style={styles.welcomePoints}>
          {(isStudent
            ? ['Tell us your interests & goals', 'Get matched with expert mentors', 'Build meaningful connections']
            : ['Share your expertise', 'Connect with eager students', 'Make a real difference']
          ).map((p, i) => (
            <View key={i} style={styles.welcomePoint}>
              <View style={styles.welcomeCheck}>
                <Ionicons name="checkmark" size={14} color={iconColor} />
              </View>
              <Text style={styles.welcomePointText}>{p}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.welcomeEstimate}>Takes about 3 minutes</Text>

        {/* ToS checkbox */}
        <TouchableOpacity
          style={styles.tosRow}
          onPress={() => onTosChange(!tosAccepted)}
          activeOpacity={0.8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: tosAccepted }}
          accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
        >
          <View style={[styles.tosCheckbox, tosAccepted && { backgroundColor: iconColor, borderColor: iconColor }]}>
            {tosAccepted && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
          <Text style={styles.tosText}>
            I agree to Mentara's{' '}
            <Text style={[styles.tosLink, { color: iconColor === Colors.primary ? Colors.accent : '#ffb347' }]}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={[styles.tosLink, { color: iconColor === Colors.primary ? Colors.accent : '#ffb347' }]}>Privacy Policy</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

function StepHeader({ title, subtitle, icon, color = Colors.primary, bg = Colors.primaryLight }: {
  title: string; subtitle: string; icon: any; color?: string; bg?: string;
}) {
  return (
    <View style={styles.stepHeader}>
      <View style={[styles.stepIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepSubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  progressContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: Colors.gray100,
  },
  progressBack: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center',
  },
  progressBar: {
    flex: 1, height: 6, backgroundColor: Colors.gray200, borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: Colors.primary, borderRadius: 3,
  },
  progressText: { fontSize: 12, color: Colors.gray500, fontWeight: '600', minWidth: 30 },
  content: { flex: 1 },
  footer: { paddingHorizontal: 24, paddingTop: 12, gap: 8 },

  // Age gate
  ageGateRoot: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 16, backgroundColor: Colors.background,
  },
  ageGateIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  ageGateTitle: { fontSize: 24, fontWeight: '800', color: Colors.dark, textAlign: 'center' },
  ageGateSub: {
    fontSize: 15, color: Colors.gray500, textAlign: 'center', lineHeight: 22,
  },
  ageGateUnderLink: { marginTop: 8, paddingVertical: 8 },
  ageGateUnderText: {
    fontSize: 13, color: Colors.gray400, textDecorationLine: 'underline',
  },
  ageBracketGroup: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
  ageBracketBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  ageBracketBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  ageBracketText: { fontSize: 15, fontWeight: '600', color: Colors.dark },
  consentRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    alignSelf: 'stretch', marginTop: 4,
    backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: 14,
    borderWidth: 1, borderColor: Colors.primaryGlow,
  },
  consentBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  consentBoxChecked: { backgroundColor: Colors.primary },
  consentText: { flex: 1, fontSize: 13, color: Colors.dark, lineHeight: 19 },

  // Welcome
  welcomeGrad: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  welcomeContent: { alignItems: 'center', gap: 20, maxWidth: 360 },
  welcomeIcon: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    ...Shadow.lg,
  },
  welcomeTitle: { fontSize: 28, fontWeight: '800', color: Colors.white, textAlign: 'center' },
  welcomeSubtitle: {
    fontSize: 16, color: 'rgba(255,255,255,0.82)', lineHeight: 24, textAlign: 'center',
  },
  welcomePoints: { alignSelf: 'stretch', gap: 12 },
  welcomePoint: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  welcomeCheck: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
  },
  welcomePointText: { fontSize: 15, color: Colors.white, fontWeight: '500' },
  welcomeEstimate: {
    fontSize: 13, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic',
  },

  // ToS checkbox
  tosRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    alignSelf: 'stretch', marginTop: 4,
  },
  tosCheckbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  tosText: {
    flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 19,
  },
  tosLink: {
    fontWeight: '700',
  },

  // Steps
  stepContent: { flex: 1, padding: 24, gap: 16 },
  stepHeader: { gap: 8, marginBottom: 4 },
  stepIcon: {
    width: 52, height: 52, borderRadius: Radius.md,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: { fontSize: 22, fontWeight: '800', color: Colors.dark },
  stepSubtitle: { fontSize: 14, color: Colors.gray500, lineHeight: 20 },

  textarea: {
    backgroundColor: Colors.gray100, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.gray200,
    padding: 14, fontSize: 15, color: Colors.dark,
    minHeight: 130,
  },
  input: {
    backgroundColor: Colors.gray100, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.gray200,
    padding: 14, fontSize: 15, color: Colors.dark, height: 52,
  },
  charCount: { fontSize: 12, color: Colors.gray400, textAlign: 'right', marginTop: -8 },
  sectionSubLabel: { fontSize: 14, fontWeight: '600', color: Colors.gray700, marginTop: 4 },

  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionChip: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray300,
    backgroundColor: Colors.white,
  },
  optionChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  optionChipText: { fontSize: 14, fontWeight: '600', color: Colors.gray700 },
  optionChipTextActive: { color: Colors.white },

  fieldScroll: { flex: 1 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 20 },
  fieldChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  fieldChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  fieldChipText: { fontSize: 13, color: Colors.gray700, fontWeight: '500' },
  fieldChipTextActive: { color: Colors.primary, fontWeight: '700' },

});
