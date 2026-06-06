import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { insertVoiceMemo } from '@/lib/supabase';
import { Colors, Fonts, Typography, Radius, Shadow, Spacing } from '@/constants/theme';
import { Meeting, VoiceMemo } from '@/lib/types';

const MAX_RECORD_SECONDS = 60;

type CardState = 'idle' | 'recording' | 'review' | 'uploading' | 'processing' | 'complete' | 'dismissed';

interface Props {
  meeting: Meeting;
  studentId: string;
  conversationId: string;
  onDismiss?: () => void;
}

export default function VoiceMemoCard({ meeting, studentId, conversationId, onDismiss }: Props) {
  const [cardState, setCardState] = useState<CardState>('idle');
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [memo, setMemo] = useState<VoiceMemo | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordedUriRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
      realtimeRef.current?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (cardState === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [cardState]);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone Permission', 'Please allow microphone access to record your reflection.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setSecondsElapsed(0);
      setCardState('recording');

      timerRef.current = setInterval(async () => {
        setSecondsElapsed((s) => {
          if (s + 1 >= MAX_RECORD_SECONDS) {
            stopRecording();
            return MAX_RECORD_SECONDS;
          }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      Alert.alert('Recording Error', 'Could not start recording. Please try again.');
    }
  };

  const stopRecording = useCallback(async () => {
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = null;
    const rec = recordingRef.current;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      recordedUriRef.current = rec.getURI();
      recordingRef.current = null;
      setCardState('review');
    } catch {
      setCardState('idle');
    }
  }, []);

  const handlePlayback = async () => {
    const uri = recordedUriRef.current;
    if (!uri) return;
    if (soundRef.current) {
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded && (status as any).isPlaying) {
        await soundRef.current.pauseAsync();
        return;
      }
      await soundRef.current.unloadAsync();
    }
    const { sound } = await Audio.Sound.createAsync({ uri });
    soundRef.current = sound;
    await sound.playAsync();
  };

  const handleReRecord = async () => {
    soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
    recordedUriRef.current = null;
    setCardState('idle');
  };

  const handleSubmit = async () => {
    const uri = recordedUriRef.current;
    if (!uri) return;
    setCardState('uploading');

    try {
      // Use expo-file-system base64 read to avoid 0-byte Blob on iOS Hermes
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const });
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const storagePath = `${studentId}/${meeting.id}.m4a`;

      const { error: uploadError } = await supabase.storage
        .from('voice-memos')
        .upload(storagePath, bytes, { contentType: 'audio/m4a', upsert: true });

      if (uploadError) throw new Error(uploadError.message);

      const inserted = await insertVoiceMemo(meeting.id, studentId, conversationId, storagePath);
      if (!inserted) throw new Error('Failed to save memo');

      setCardState('processing');

      // Subscribe to realtime updates on this voice_memo row
      realtimeRef.current = supabase
        .channel(`voice_memo:${inserted.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'voice_memos',
          filter: `id=eq.${inserted.id}`,
        }, (payload) => {
          const updated = payload.new as VoiceMemo;
          if (updated.processing_status === 'completed' || updated.processing_status === 'failed') {
            setMemo(updated);
            setCardState('complete');
            realtimeRef.current?.unsubscribe();
          }
        })
        .subscribe();

      // Trigger processing edge function (fire-and-forget)
      supabase.functions.invoke('process-voice-memo', {
        body: { voiceMemoId: inserted.id },
      }).catch(() => {});
    } catch (e: any) {
      Alert.alert('Upload Error', e.message ?? 'Could not upload your reflection. Please try again.');
      setCardState('review');
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (cardState === 'dismissed') return null;

  return (
    <View style={styles.container}>
      {/* Complete state */}
      {cardState === 'complete' && memo && (
        <View style={styles.completeCard}>
          <View style={styles.completeHeader}>
            <View style={styles.completeIconWrap}>
              <Ionicons name="sparkles" size={18} color={Colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.completeTitle}>Reflection saved</Text>
              <Text style={styles.completeSubtitle}>Here's what Mentara noted</Text>
            </View>
            <TouchableOpacity
              onPress={() => { onDismiss?.(); setCardState('dismissed'); }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={Colors.gray400} />
            </TouchableOpacity>
          </View>
          {memo.ai_insight && (
            <View style={styles.insightBox}>
              <Text style={styles.insightLabel}>KEY TAKEAWAY</Text>
              <Text style={styles.insightText}>{memo.ai_insight}</Text>
            </View>
          )}
          {memo.ai_action_item && (
            <View style={styles.actionBox}>
              <Ionicons name="arrow-forward-circle" size={14} color={Colors.primary} />
              <Text style={styles.actionText}>{memo.ai_action_item}</Text>
            </View>
          )}
        </View>
      )}

      {/* Processing state */}
      {(cardState === 'processing' || cardState === 'uploading') && (
        <View style={styles.processingRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.processingText}>
            {cardState === 'uploading' ? 'Uploading reflection...' : 'Mentara is reading your reflection...'}
          </Text>
        </View>
      )}

      {/* Idle / Record state */}
      {(cardState === 'idle' || cardState === 'recording') && (
        <View style={styles.recordArea}>
          <View style={styles.recordHeader}>
            <Ionicons name="mic-outline" size={15} color={Colors.primary} />
            <Text style={styles.recordTitle}>Reflect on your call</Text>
          </View>
          <Text style={styles.recordPrompt}>
            What was the most important thing you learned today?
          </Text>
          <View style={styles.recordControls}>
            <Animated.View style={[styles.recordBtnWrap, { transform: [{ scale: pulseAnim }] }]}>
              <TouchableOpacity
                style={[
                  styles.recordBtn,
                  cardState === 'recording' && styles.recordBtnActive,
                ]}
                onPress={cardState === 'idle' ? startRecording : stopRecording}
                accessibilityRole="button"
                accessibilityLabel={cardState === 'idle' ? 'Start recording' : 'Stop recording'}
              >
                <Ionicons
                  name={cardState === 'idle' ? 'mic' : 'stop'}
                  size={26}
                  color={Colors.white}
                />
              </TouchableOpacity>
            </Animated.View>
            {cardState === 'recording' && (
              <View style={styles.timerRow}>
                <View style={styles.timerDot} />
                <Text style={styles.timerText}>{formatTime(secondsElapsed)} / {formatTime(MAX_RECORD_SECONDS)}</Text>
              </View>
            )}
          </View>
          {cardState === 'idle' && (
            <Text style={styles.recordHint}>Tap the mic to record up to 60 seconds</Text>
          )}
        </View>
      )}

      {/* Review state */}
      {cardState === 'review' && (
        <View style={styles.reviewArea}>
          <View style={styles.recordHeader}>
            <Ionicons name="checkmark-circle-outline" size={15} color={Colors.accent3} />
            <Text style={[styles.recordTitle, { color: Colors.accent3 }]}>Recording ready</Text>
          </View>
          <View style={styles.reviewControls}>
            <TouchableOpacity
              style={styles.playBtn}
              onPress={handlePlayback}
              accessibilityRole="button"
              accessibilityLabel="Play back recording"
            >
              <Ionicons name="play-circle-outline" size={40} color={Colors.primary} />
            </TouchableOpacity>
            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={styles.reRecordBtn}
                onPress={handleReRecord}
                accessibilityRole="button"
                accessibilityLabel="Re-record"
              >
                <Ionicons name="refresh" size={14} color={Colors.gray500} />
                <Text style={styles.reRecordText}>Re-record</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSubmit}
                accessibilityRole="button"
                accessibilityLabel="Submit reflection"
              >
                <Text style={styles.submitText}>Submit</Text>
                <Ionicons name="arrow-forward" size={14} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderColor: Colors.gray100,
  },

  /* Complete */
  completeCard: {
    padding: 14,
    gap: 10,
  },
  completeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  completeIconWrap: {
    width: 34, height: 34,
    backgroundColor: Colors.accentLight,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeTitle: { ...Typography.headingSm, color: Colors.dark },
  completeSubtitle: { ...Typography.caption, color: Colors.gray500 },
  insightBox: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    padding: 12,
    gap: 4,
  },
  insightLabel: { ...Typography.label, color: Colors.primary, letterSpacing: 0.5 },
  insightText: { ...Typography.bodyMd, color: Colors.dark, lineHeight: 20 },
  actionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    padding: 10,
  },
  actionText: { ...Typography.bodySm, color: Colors.gray700, flex: 1, lineHeight: 18 },

  /* Processing */
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  processingText: { ...Typography.bodyMd, color: Colors.gray500, fontFamily: Fonts.sansMedium },

  /* Record */
  recordArea: { padding: 14, gap: 8 },
  recordHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordTitle: { ...Typography.label, color: Colors.primary, letterSpacing: 0.4 },
  recordPrompt: { ...Typography.bodyMd, color: Colors.dark, lineHeight: 20 },
  recordControls: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  recordBtnWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtn: {
    width: 52, height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  recordBtnActive: {
    backgroundColor: Colors.accent2,
  },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timerDot: {
    width: 7, height: 7,
    borderRadius: 4,
    backgroundColor: Colors.accent2,
  },
  timerText: { ...Typography.bodyMd, color: Colors.dark, fontFamily: Fonts.sansMedium },
  recordHint: { ...Typography.caption, color: Colors.gray400 },

  /* Review */
  reviewArea: { padding: 14, gap: 10 },
  reviewControls: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  playBtn: { padding: 4 },
  reviewActions: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reRecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reRecordText: { ...Typography.bodySm, color: Colors.gray500 },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
  submitText: { ...Typography.bodySm, fontFamily: Fonts.sansBold, color: Colors.white },
});
