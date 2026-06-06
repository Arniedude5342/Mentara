import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors, Radius, Fonts } from '@/constants/theme';

const logoImage = require('@/assets/logo.png');

interface BotMessageBubbleProps {
  content: string;
  timestamp: string;
  showTime?: boolean;
}

export default function BotMessageBubble({ content, timestamp, showTime }: BotMessageBubbleProps) {
  const timeStr = new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.avatarWrap}>
        <Image source={logoImage} style={styles.avatar} resizeMode="cover" />
      </View>

      <View style={styles.contentCol}>
        <Text style={styles.botLabel}>Mentara</Text>
        <View style={styles.bubble}>
          <Text style={styles.messageText}>{content}</Text>
        </View>
        {showTime && <Text style={styles.timestamp}>{timeStr}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
    maxWidth: '90%',
    alignSelf: 'flex-start',
  },
  avatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 8.4,
    overflow: 'hidden',
    flexShrink: 0,
    marginTop: 18,
    backgroundColor: 'transparent',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 8.4,
  },
  contentCol: { flex: 1, gap: 3 },
  botLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginLeft: 2,
  },
  bubble: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Colors.dark,
    lineHeight: 21,
  },
  timestamp: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Colors.gray400,
    marginLeft: 4,
  },
});
