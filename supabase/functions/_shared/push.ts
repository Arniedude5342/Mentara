// Shared push notification helper for Supabase Edge Functions.
// Sends an Expo push notification to a single user.
// Silently no-ops if the user has no registered token (app never opened, or
// notifications denied) — callers don't need to handle this case.

export async function sendPushToUser(
  supabase: any,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const { data: tokenRow } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId)
    .maybeSingle();

  if (!tokenRow?.token) return;

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: tokenRow.token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
      priority: 'high',
    }),
  });

  const result = await res.json();

  // Expo returns DeviceNotRegistered when the token has expired or the user
  // deleted/reinstalled the app. Remove the dead token so we stop trying.
  if (result.data?.status === 'DeviceNotRegistered') {
    await supabase.from('push_tokens').delete().eq('token', tokenRow.token);
  }
}
