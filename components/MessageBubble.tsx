import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { Colors } from '@/constants/theme';

interface MessageBubbleProps {
  content: string;
  isMine: boolean;
  timestamp: string;
  showTime?: boolean;
  messageId?: string;
  senderId?: string | null;
  conversationId?: string;
}

export default function MessageBubble({
  content, isMine, timestamp, showTime = true,
  messageId, senderId, conversationId,
}: MessageBubbleProps) {
  const parsedDate = new Date(timestamp);
  const time = isNaN(parsedDate.getTime())
    ? ''
    : parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleLongPress = () => {
    if (isMine) return; // only report other people's messages
    Alert.alert(
      'Report Message',
      'Does this message violate our community guidelines?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            const subject = encodeURIComponent('Report: Inappropriate Message');
            const body = encodeURIComponent(
              `I want to report this message:\n\nMessage ID: ${messageId ?? 'unknown'}\nSender ID: ${senderId ?? 'unknown'}\nConversation ID: ${conversationId ?? 'unknown'}\nContent: ${content}\n\nReason:\n[Please describe why this message is inappropriate]`
            );
            Linking.openURL(`mailto:mentarasupport@gmail.com?subject=${subject}&body=${body}`);
          },
        },
      ],
    );
  };

  return (
    <TouchableOpacity
      onLongPress={handleLongPress}
      activeOpacity={1}
      delayLongPress={400}
      accessible
      accessibilityLabel={isMine ? `You: ${content}` : `Message: ${content}. Long press to report.`}
    >
      <View style={[styles.wrapper, isMine && styles.wrapperMine]}>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
          {!isMine && <View style={styles.incomingBar} />}
          <Text style={[styles.text, isMine && styles.textMine]}>{content}</Text>
        </View>
        {showTime && <Text style={[styles.time, isMine && styles.timeMine]}>{time}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-start',
    marginVertical: 3,
    paddingHorizontal: 16,
  },
  wrapperMine: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 2,
    overflow: 'hidden',
  },
  bubbleMine: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 0,
  },
  bubbleTheirs: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderBottomLeftRadius: 0,
  },
  incomingBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: Colors.primary,
  },
  text: {
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  textMine: {
    color: Colors.white,
  },
  time: {
    fontSize: 11,
    color: Colors.gray400,
    marginTop: 4,
    marginHorizontal: 4,
  },
  timeMine: {
    textAlign: 'right',
  },
});
