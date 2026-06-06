// Bot identity constants
// Bot messages are inserted server-side via the send_bot_message SECURITY DEFINER RPC.
// sender_id is NULL for all bot messages; sender_type = 'bot' distinguishes them.

export const BOT_SENDER_ID = null;
export const BOT_DISPLAY_NAME = 'Mentara';
export const BOT_AVATAR = null; // uses the Mentara M mark in BotMessageBubble instead
