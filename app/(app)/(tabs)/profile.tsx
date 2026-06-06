import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Linking, Share,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import { Colors, Fonts, Typography, Radius, Shadow, Spacing, FIELDS_OF_EXPERTISE } from '@/constants/theme';
import { updateProfile, upsertMentorProfile, upsertStudentProfile, uploadAvatar, getStudentProfile, getMentorById, deleteAccount, getMyReferralCode, getMyReferrals, getUserAchievements } from '@/lib/supabase';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const isStudent = profile?.role === 'student';
  const roleColor = isStudent ? Colors.primary : Colors.accent2;
  const roleColorLight = isStudent ? Colors.primaryLight : Colors.accent2Light;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Profile fields
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [location, setLocation] = useState(profile?.location ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');

  // Extended profile
  const [extProfile, setExtProfile] = useState<any>(null);
  // Referral
  const [myReferralCode, setMyReferralCode] = useState<string | null>(null);
  const [myReferrals, setMyReferrals] = useState<Array<{ id: string; full_name: string | null }>>([]);
  // Achievements
  const [achievements, setAchievements] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    if (isStudent) {
      getStudentProfile(user.id).then(({ data }) => { if (data) setExtProfile(data); });
      getMyReferralCode(user.id).then(setMyReferralCode);
      getMyReferrals(user.id).then(setMyReferrals);
      getUserAchievements(user.id).then(setAchievements);
    } else {
      getMentorById(user.id).then(({ data }) => { if (data) setExtProfile(data); });
    }
  }, [user]);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setBio(profile?.bio ?? '');
    setLocation(profile?.location ?? '');
    setWebsite(profile?.website ?? '');
  }, [profile]);

  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        Alert.alert(
          'Photo access required',
          'Mentara needs access to your photo library. Open Settings and enable Photos access.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      } else {
        Alert.alert('Permission needed', 'Allow access to your photo library to change your profile picture.');
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled && user && result.assets?.[0]?.uri) {
      setUploadingAvatar(true);
      const { url, error } = await uploadAvatar(user.id, result.assets[0].uri);
      if (error) {
        setUploadingAvatar(false);
        Alert.alert('Upload failed', (error as any).message ?? 'Could not upload photo.');
        return;
      }
      if (url) {
        await updateProfile(user.id, { avatar_url: url });
        await refreshProfile();
      }
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    const trimmedWebsite = website.trim();
    if (trimmedWebsite && !trimmedWebsite.startsWith('https://') && !trimmedWebsite.startsWith('http://')) {
      Alert.alert('Invalid website', 'Website must start with https:// or http://');
      return;
    }
    setSaving(true);
    const { error } = await updateProfile(user.id, {
      full_name: trimmedName,
      bio: bio.trim(),
      location: location.trim(),
      website: trimmedWebsite,
    });
    if (error) {
      setSaving(false);
      Alert.alert('Save failed', (error as any).message ?? 'Could not save profile. Please try again.');
      return;
    }
    await refreshProfile();
    setSaving(false);
    setEditing(false);
  };

  const handleShareReferral = async () => {
    if (!myReferralCode) return;
    const link = `mentara://ref/${myReferralCode}`;
    await Share.share({
      message: `Join me on Mentara — I found an amazing mentor in seconds! Use my invite link: ${link}`,
      title: 'Join Mentara',
    });
  };

  const ACHIEVEMENT_LABELS: Record<string, { icon: string; label: string }> = {
    first_session: { icon: 'star', label: 'First Session' },
    five_sessions: { icon: 'trophy', label: '5 Sessions' },
    voice_memo: { icon: 'mic', label: 'Voice Memo' },
    goal_achieved: { icon: 'flag', label: 'Goal Achieved' },
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    if (deletingAccount) return;
    // Step 1: Initial confirmation
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data, including conversations and profile information. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            // Step 2: Final confirmation
            Alert.alert(
              'Are you absolutely sure?',
              `Type-confirm: deleting your account will remove all data permanently. Your mentoring history, messages, and profile will be gone forever.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeletingAccount(true);
                    const { error } = await deleteAccount();
                    if (error) {
                      setDeletingAccount(false);
                      Alert.alert('Deletion failed', error.message ?? 'Could not delete account. Please try again.');
                      return;
                    }
                    // Navigation handled by AppLayout when session becomes null
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  if (!profile) {
    return <View style={styles.center}><ActivityIndicator color={roleColor} size="large" /></View>;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.headerGrad, { backgroundColor: isStudent ? Colors.primaryDark : Colors.mentorHeaderBg }]}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Account</Text>
            <TouchableOpacity
              onPress={() => setEditing((e) => !e)}
              style={styles.editBtn}
              accessibilityLabel={editing ? 'Cancel editing' : 'Edit profile'}
              accessibilityRole="button"
            >
              <Ionicons name={editing ? 'close' : 'create-outline'} size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <View style={styles.avatarArea}>
            <TouchableOpacity
              onPress={handlePickAvatar}
              style={styles.avatarTouch}
              disabled={uploadingAvatar}
              accessibilityLabel="Change profile photo"
              accessibilityRole="button"
            >
              {uploadingAvatar ? (
                <View style={styles.avatarLoading}>
                  <ActivityIndicator color={roleColor} />
                </View>
              ) : (
                <Avatar uri={profile.avatar_url} name={profile.full_name} size={90} />
              )}
              <View style={[styles.avatarEditBadge, { backgroundColor: isStudent ? Colors.primary : Colors.accent2 }]}>
                <Ionicons name="camera" size={14} color={Colors.white} />
              </View>
            </TouchableOpacity>

            {!editing ? (
              <>
                <Text style={styles.profileName}>{profile.full_name ?? 'Set your name'}</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>
                    {isStudent ? '🎓 Student' : '⭐ Mentor'}
                  </Text>
                </View>
                {profile.location && (
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.locationText}>{profile.location}</Text>
                  </View>
                )}
              </>
            ) : null}
          </View>
        </View>

        {editing ? (
          /* ── Edit mode ── */
          <View style={styles.editSection}>
            <Text style={styles.sectionTitle}>Edit Profile</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your full name"
                placeholderTextColor={Colors.gray400}
                accessibilityLabel="Full name"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <TextInput
                style={[styles.fieldInput, styles.textarea]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell others about yourself..."
                placeholderTextColor={Colors.gray400}
                multiline numberOfLines={4} textAlignVertical="top"
                maxLength={500}
                accessibilityLabel="Bio"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Location</Text>
              <TextInput
                style={styles.fieldInput}
                value={location}
                onChangeText={setLocation}
                placeholder="City, State"
                placeholderTextColor={Colors.gray400}
                accessibilityLabel="Location"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Website</Text>
              <TextInput
                style={styles.fieldInput}
                value={website}
                onChangeText={setWebsite}
                placeholder="https://yourwebsite.com"
                placeholderTextColor={Colors.gray400}
                keyboardType="url"
                autoCapitalize="none"
                accessibilityLabel="Website"
              />
            </View>

            <Button title="Save Changes" onPress={handleSave} loading={saving} />
            <Button title="Cancel" onPress={() => setEditing(false)} variant="outline" />
          </View>
        ) : (
          /* ── View mode ── */
          <View style={styles.viewSection}>
            {/* Bio */}
            {profile.bio && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>About</Text>
                <Text style={styles.cardText}>{profile.bio}</Text>
              </View>
            )}

            {/* Contact info */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Details</Text>
              <InfoRow icon="mail-outline" label="Email" value={profile.email} />
              {profile.location && <InfoRow icon="location-outline" label="Location" value={profile.location} />}
              {profile.website && <InfoRow icon="globe-outline" label="Website" value={profile.website} />}
              {!isStudent && extProfile?.institution && (
                <InfoRow icon="business-outline" label="Institution" value={extProfile.institution} />
              )}
              {!isStudent && extProfile?.title && (
                <InfoRow icon="briefcase-outline" label="Title" value={extProfile.title} />
              )}
            </View>

            {/* Extended fields */}
            {extProfile && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {isStudent ? 'Learning Profile' : 'Mentor Profile'}
                </Text>
                {isStudent ? (
                  <>
                    {extProfile.grade_level && (
                      <InfoRow icon="school-outline" label="Level" value={
                        { high_school: 'High School', undergrad: 'Undergraduate', undergraduate: 'Undergraduate', graduate: 'Graduate', professional: 'Professional', phd: 'PhD', early_career: 'Early Career', other: 'Other' }[extProfile.grade_level as string] ?? extProfile.grade_level
                      } />
                    )}
                    {extProfile.fields_of_interest?.length > 0 && (
                      <View style={styles.tagsRow}>
                        <Text style={styles.tagLabel}>Interests:</Text>
                        <View style={styles.tags}>
                          {extProfile.fields_of_interest.slice(0, 5).map((f: string) => (
                            <View key={f} style={styles.tag}>
                              <Text style={styles.tagText}>{f}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    {extProfile.learning_goals && (
                      <View style={styles.goalsBox}>
                        <Text style={styles.goalsLabel}>Learning Goals</Text>
                        <Text style={styles.goalsText}>{extProfile.learning_goals}</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    {extProfile.years_experience > 0 && (
                      <InfoRow icon="time-outline" label="Experience" value={`${extProfile.years_experience} years`} />
                    )}
                    {extProfile.fields_of_expertise?.length > 0 && (
                      <View style={styles.tagsRow}>
                        <Text style={styles.tagLabel}>Expertise:</Text>
                        <View style={styles.tags}>
                          {extProfile.fields_of_expertise.slice(0, 5).map((f: string) => (
                            <View key={f} style={[styles.tag, { backgroundColor: roleColorLight }]}>
                              <Text style={[styles.tagText, { color: roleColor, fontWeight: '600' }]}>{f}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                )}
                <TouchableOpacity
                  style={styles.updateBtn}
                  onPress={() => router.push('/(auth)/onboarding')}
                  accessibilityLabel="Update questionnaire"
                  accessibilityRole="button"
                >
                  <Text style={[styles.updateBtnText, { color: roleColor }]}>Update questionnaire</Text>
                  <Ionicons name="arrow-forward" size={14} color={roleColor} />
                </TouchableOpacity>
              </View>
            )}

            {/* Achievements (students only) */}
            {isStudent && achievements.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Achievements</Text>
                <View style={styles.achievementsRow}>
                  {achievements.map((ach) => {
                    const info = ACHIEVEMENT_LABELS[ach];
                    if (!info) return null;
                    return (
                      <View key={ach} style={[styles.achievementBadge, { backgroundColor: Colors.primaryLight }]}>
                        <Ionicons name={info.icon as any} size={16} color={Colors.primary} />
                        <Text style={styles.achievementLabel}>{info.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Referral (students only) */}
            {isStudent && myReferralCode && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Invite Friends</Text>
                <Text style={styles.referralDesc}>
                  Share your personal invite link. Your friends will see your name when they join!
                </Text>
                <View style={styles.referralCodeRow}>
                  <Text style={styles.referralCode}>{myReferralCode}</Text>
                  <TouchableOpacity
                    style={[styles.referralShareBtn, { backgroundColor: Colors.primary }]}
                    onPress={handleShareReferral}
                    accessibilityLabel="Share invite link"
                    accessibilityRole="button"
                  >
                    <Ionicons name="share-outline" size={16} color={Colors.white} />
                    <Text style={styles.referralShareText}>Share</Text>
                  </TouchableOpacity>
                </View>
                {myReferrals.length > 0 && (
                  <View style={styles.referralsList}>
                    <Text style={styles.referralsTitle}>You invited</Text>
                    {myReferrals.slice(0, 5).map((r) => (
                      <View key={r.id} style={styles.referralRow}>
                        <Ionicons name="person-outline" size={15} color={Colors.primary} />
                        <Text style={styles.referralName}>{r.full_name ?? 'A friend'}</Text>
                        <Text style={styles.referralJoined}>Joined!</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Support */}
            <View style={styles.card}>
              <View style={styles.supportHeader}>
                <View style={styles.supportIconWrap}>
                  <Ionicons name="headset-outline" size={20} color={roleColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Help & Support</Text>
                  <Text style={styles.supportSub}>We're here for you</Text>
                </View>
              </View>
              <Text style={styles.supportBody}>
                Have a question, issue, or feedback? Reach out to our support team and we'll get back to you as soon as possible.
              </Text>
              <TouchableOpacity
                style={[styles.supportEmailBtn, { borderColor: roleColor }]}
                onPress={() => Linking.openURL('mailto:mentarasupport@gmail.com').catch(() => {})}
                accessibilityLabel="Email support"
                accessibilityRole="button"
                activeOpacity={0.75}
              >
                <Ionicons name="mail-outline" size={16} color={roleColor} />
                <Text style={[styles.supportEmailText, { color: roleColor }]}>mentarasupport@gmail.com</Text>
                <Ionicons name="arrow-forward" size={14} color={roleColor} />
              </TouchableOpacity>
            </View>

            {/* Actions */}
            <View style={styles.actionsCard}>
              <ActionRow
                icon="help-circle-outline"
                label="About Mentara"
                onPress={() => router.push('/about')}
              />
              <ActionRow
                icon="shield-outline"
                label="Privacy Policy"
                onPress={() => router.push('/(app)/privacy')}
              />
              <ActionRow
                icon="document-text-outline"
                label="Terms of Service"
                onPress={() => router.push('/terms')}
              />
              <ActionRow
                icon="log-out-outline"
                label="Sign Out"
                onPress={handleSignOut}
                danger
              />
              <ActionRow
                icon="trash-outline"
                label={deletingAccount ? 'Deleting account…' : 'Delete Account'}
                onPress={handleDeleteAccount}
                danger
              />
            </View>

            <Text style={styles.versionText}>Mentara v1.0.0</Text>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={Colors.gray500} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ActionRow({ icon, label, onPress, danger = false }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress} activeOpacity={0.7} accessibilityLabel={label} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={danger ? Colors.error : Colors.gray500} />
      <Text style={[styles.actionLabel, danger && styles.actionLabelDanger]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerGrad: {
    paddingHorizontal: Spacing.lg, paddingBottom: 34,
    backgroundColor: Colors.primaryDark,
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Spacing.md, marginBottom: 24,
  },
  headerTitle: { ...Typography.displaySm, color: Colors.white },
  editBtn: {
    width: 44, height: 44,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  avatarArea: { alignItems: 'center', gap: 10 },
  avatarTouch: { position: 'relative' },
  avatarLoading: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.gray200, alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 26, height: 26,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.white,
  },
  profileName: { fontSize: 22, fontWeight: '800', color: Colors.white },
  roleBadge: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.2)',
  },
  roleBadgeText: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },

  viewSection: { padding: 20, gap: 14 },
  editSection: { padding: 20, gap: 14 },

  sectionTitle: { fontSize: 20, fontWeight: '800', color: Colors.dark, marginBottom: 4 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  fieldInput: {
    backgroundColor: Colors.gray100, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.gray200,
    padding: 14, fontSize: 15, color: Colors.dark,
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' },

  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 18, gap: 12, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  cardText: { fontSize: 14, color: Colors.gray700, lineHeight: 22 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabel: { fontSize: 13, color: Colors.gray500, width: 80 },
  infoValue: { flex: 1, fontSize: 14, color: Colors.dark, fontWeight: '500' },

  tagsRow: { gap: 6 },
  tagLabel: { fontSize: 13, color: Colors.gray500 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full, backgroundColor: Colors.gray100,
  },
  tagPrimary: { backgroundColor: Colors.primaryLight },
  tagText: { fontSize: 12, color: Colors.gray700, fontWeight: '500' },
  tagTextPrimary: { color: Colors.primary, fontWeight: '600' },
  goalsBox: { backgroundColor: Colors.gray100, borderRadius: Radius.md, padding: 12, gap: 4 },
  goalsLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },
  goalsText: { fontSize: 13, color: Colors.gray700, lineHeight: 20 },

  updateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginTop: 4,
  },
  updateBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  actionsCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, ...Shadow.sm, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 18,
    borderBottomWidth: 1, borderColor: Colors.gray100,
  },
  actionLabel: { flex: 1, fontSize: 15, color: Colors.dark, fontWeight: '500' },
  actionLabelDanger: { color: Colors.error },

  versionText: { fontSize: 12, color: Colors.gray400, textAlign: 'center', marginTop: 8 },

  achievementsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  achievementBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
  },
  achievementLabel: { fontSize: 12, fontFamily: Fonts.sansSemiBold, color: Colors.primary },

  referralDesc: { fontSize: 13, color: Colors.gray500, lineHeight: 19 },
  referralCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  referralCode: {
    flex: 1, fontSize: 20, fontFamily: Fonts.sansBold,
    color: Colors.primary, letterSpacing: 3,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radius.md, textAlign: 'center',
  },
  referralShareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: Radius.md,
  },
  referralShareText: { fontSize: 14, fontFamily: Fonts.sansBold, color: Colors.white },

  referralsList: { gap: 8, marginTop: 4 },
  referralsTitle: { fontSize: 12, color: Colors.gray400, fontFamily: Fonts.sansSemiBold, letterSpacing: 0.4 },
  referralRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  referralName: { flex: 1, fontSize: 14, color: Colors.dark, fontFamily: Fonts.sansMedium },
  referralJoined: { fontSize: 12, color: Colors.accent3, fontFamily: Fonts.sansSemiBold },

  supportHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  supportIconWrap: {
    width: 40, height: 40,
    backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center',
  },
  supportSub: { fontSize: 12, color: Colors.gray400, marginTop: 1 },
  supportBody: {
    fontSize: 13, color: Colors.gray700, lineHeight: 20,
  },
  supportEmailBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: Radius.md, borderWidth: 1.5,
    backgroundColor: Colors.gray100,
    alignSelf: 'stretch',
  },
  supportEmailText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
