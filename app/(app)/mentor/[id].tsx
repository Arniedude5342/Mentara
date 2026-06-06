import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Spacing, Typography, Fonts } from '@/constants/theme';
import { getMentorById } from '@/lib/supabase';
import { getMyAssignment, requestNewMentor } from '@/lib/meetings';
import { useAuth } from '@/context/AuthContext';
import Avatar from '@/components/ui/Avatar';
import { MentorProfile, Profile } from '@/lib/types';

type MentorDetail = MentorProfile & { profile: Profile };

export default function MentorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user, profile: authProfile } = useAuth();
  const [mentor, setMentor] = useState<MentorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getMentorById(id).then(({ data, error: err }) => {
      if (err) setError('Could not load mentor profile.');
      else setMentor(data as MentorDetail);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!user || authProfile?.role !== 'student') return;
    getMyAssignment(user.id, 'student').then((data) => {
      if (data && data.mentor_id === id) setAssignment(data);
    });
  }, [user, authProfile?.role, id]);

  const profile = mentor?.profile;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={Colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile?.full_name ?? 'Mentor Profile'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error || !mentor ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={44} color={Colors.gray300} />
          <Text style={styles.errorText}>{error ?? 'Mentor not found.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.heroCard}>
            <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={80} />
            <Text style={styles.mentorName}>{profile?.full_name}</Text>
            {mentor.title ? <Text style={styles.mentorTitle}>{mentor.title}</Text> : null}
            {mentor.institution ? (
              <Text style={styles.mentorInstitution}>{mentor.institution}</Text>
            ) : null}

            <View style={styles.badgeRow}>
              {mentor.is_free && (
                <View style={[styles.badge, { backgroundColor: Colors.accent3Light }]}>
                  <Ionicons name="gift-outline" size={12} color={Colors.accent3} />
                  <Text style={[styles.badgeText, { color: Colors.accent3 }]}>Free</Text>
                </View>
              )}
              {mentor.verified && (
                <View style={[styles.badge, { backgroundColor: Colors.primaryLight }]}>
                  <Ionicons name="checkmark-circle" size={12} color={Colors.primary} />
                  <Text style={[styles.badgeText, { color: Colors.primary }]}>Verified</Text>
                </View>
              )}
              {mentor.years_experience > 0 && (
                <View style={[styles.badge, { backgroundColor: Colors.accentLight }]}>
                  <Text style={[styles.badgeText, { color: Colors.accent }]}>
                    {mentor.years_experience}y exp
                  </Text>
                </View>
              )}
            </View>
          </View>

          {profile?.bio ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.sectionBody}>{profile.bio}</Text>
            </View>
          ) : null}

          {mentor.mentoring_style ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mentoring Style</Text>
              <Text style={styles.sectionBody}>{mentor.mentoring_style}</Text>
            </View>
          ) : null}

          {mentor.fields_of_expertise.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Areas of Expertise</Text>
              <View style={styles.chipRow}>
                {mentor.fields_of_expertise.map((f) => (
                  <View key={f} style={styles.chip}>
                    <Text style={styles.chipText}>{f}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {mentor.availability.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Availability</Text>
              <View style={styles.chipRow}>
                {mentor.availability.map((a) => (
                  <View key={a} style={[styles.chip, styles.chipPrimary]}>
                    <Text style={[styles.chipText, { color: Colors.primary }]}>
                      {a.replace(/_/g, ' ')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {profile?.location ? (
            <View style={[styles.section, styles.locationRow]}>
              <Ionicons name="location-outline" size={15} color={Colors.gray500} />
              <Text style={styles.locationText}>{profile.location}</Text>
            </View>
          ) : null}

          {/* Report / safety — App Store Guideline 1.2 (UGC reporting requirement) */}
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => {
              const subject = encodeURIComponent(`Report mentor: ${profile?.full_name ?? mentor?.id}`);
              const body = encodeURIComponent(
                `Mentor ID: ${mentor?.id}\nMentor name: ${profile?.full_name ?? ''}\n\nPlease describe what happened:\n`,
              );
              Alert.alert(
                'Report this mentor',
                "If this mentor has behaved inappropriately, we'll review the conversation and take action.",
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Report via email',
                    style: 'destructive',
                    onPress: () => Linking.openURL(`mailto:mentarasupport@gmail.com?subject=${subject}&body=${body}`).catch(() => {}),
                  },
                ],
              );
            }}
            accessibilityRole="button"
            accessibilityLabel="Report this mentor"
            activeOpacity={0.8}
          >
            <Ionicons name="flag-outline" size={15} color={Colors.gray500} />
            <Text style={styles.reportBtnText}>Report inappropriate behavior</Text>
          </TouchableOpacity>

          {assignment && (
            <TouchableOpacity
              style={[styles.reportBtn, styles.newMentorBtn]}
              onPress={() => {
                Alert.alert(
                  'Request a new mentor?',
                  "We'll find you a better match. Your current chats and notes will be saved.",
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Yes, find me a new mentor',
                      onPress: async () => {
                        setRequesting(true);
                        if (!user) { Alert.alert('Session expired', 'Please sign in again.'); return; }
                        const ok = await requestNewMentor(assignment.id, user.id);
                        setRequesting(false);
                        if (!ok) {
                          Alert.alert('Could not process', 'Please try again later.');
                          return;
                        }
                        Alert.alert(
                          'Finding your new mentor!',
                          "We're matching you now. You'll get a notification once your new mentor is ready.",
                          [{ text: 'OK', onPress: () => router.replace('/(app)/(tabs)/messages') }],
                        );
                      },
                    },
                  ],
                );
              }}
              disabled={requesting}
              accessibilityRole="button"
              accessibilityLabel="Request a new mentor"
              activeOpacity={0.8}
            >
              {requesting ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={15} color={Colors.primary} />
                  <Text style={[styles.reportBtnText, { color: Colors.primary }]}>Request a different mentor</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.headingMd,
    color: Colors.dark,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { ...Typography.bodyMd, color: Colors.gray500, textAlign: 'center' },

  content: { paddingTop: 24, paddingHorizontal: Spacing.lg, gap: 4 },

  heroCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  mentorName: { ...Typography.headingLg, color: Colors.dark, textAlign: 'center', marginTop: 4 },
  mentorTitle: { ...Typography.bodyMd, color: Colors.gray700, textAlign: 'center' },
  mentorInstitution: { ...Typography.bodySm, color: Colors.gray500, textAlign: 'center' },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeText: { ...Typography.caption, fontFamily: Fonts.sansSemiBold },

  section: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    gap: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: { ...Typography.headingSm, color: Colors.dark },
  sectionBody: { ...Typography.bodyMd, color: Colors.gray700, lineHeight: 22 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray100,
    borderWidth: 1, borderColor: Colors.gray200,
  },
  chipPrimary: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primaryGlow,
  },
  chipText: { ...Typography.bodySm, color: Colors.gray700, fontFamily: Fonts.sansMedium },

  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  locationText: { ...Typography.bodyMd, color: Colors.gray500 },

  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, backgroundColor: Colors.white,
  },
  newMentorBtn: {
    borderColor: Colors.primaryGlow,
    backgroundColor: Colors.primaryLight,
  },
  reportBtnText: { ...Typography.bodySm, color: Colors.gray500, fontFamily: Fonts.sansSemiBold },
});
