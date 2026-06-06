import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

const ACCESS_KEY = 'gcal_access_token';
const REFRESH_KEY = 'gcal_refresh_token';

// Google iOS OAuth requires the reversed client ID as the URL scheme.
// e.g. "123456-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123456-abc"
function reversedClientIdScheme(): string {
  const prefix = IOS_CLIENT_ID.split('.apps.googleusercontent.com')[0];
  return `com.googleusercontent.apps.${prefix}`;
}

export interface GCalEventParams {
  title: string;
  startDate: Date;
  endDate: Date;
  description?: string;
  reminderMinutes?: number;
}

export async function isGCalAuthorized(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(ACCESS_KEY);
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  return !!(token || refresh);
}

async function refreshGCalToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: IOS_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });
    const json = await res.json();
    if (json.access_token) {
      await SecureStore.setItemAsync(ACCESS_KEY, json.access_token);
      return json.access_token;
    }
    // Refresh token is invalid — clear stored credentials so next attempt re-authorizes
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    return null;
  } catch {
    return null;
  }
}

async function getValidAccessToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(ACCESS_KEY);
  if (token) return token;
  return refreshGCalToken();
}

export async function authorizeGoogleCalendar(): Promise<boolean> {
  if (!IOS_CLIENT_ID) {
    console.warn('[GCal] EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not set');
    return false;
  }

  const scheme = reversedClientIdScheme();
  const redirectUri = `${scheme}:/oauth2redirect`;

  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: TOKEN_ENDPOINT,
  };

  const request = new AuthSession.AuthRequest({
    clientId: IOS_CLIENT_ID,
    scopes: SCOPES,
    redirectUri,
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  await request.makeAuthUrlAsync(discovery);
  const result = await request.promptAsync(discovery);

  if (result.type !== 'success') return false;

  try {
    const tokenRes = await AuthSession.exchangeCodeAsync(
      {
        clientId: IOS_CLIENT_ID,
        redirectUri,
        code: result.params.code,
        extraParams: {
          code_verifier: request.codeVerifier ?? '',
        },
      },
      discovery,
    );

    if (tokenRes.accessToken) {
      await SecureStore.setItemAsync(ACCESS_KEY, tokenRes.accessToken);
    }
    if (tokenRes.refreshToken) {
      await SecureStore.setItemAsync(REFRESH_KEY, tokenRes.refreshToken);
    }
    return !!(tokenRes.accessToken);
  } catch {
    return false;
  }
}

export async function createGCalEvent(params: GCalEventParams): Promise<string | null> {
  const { title, startDate, endDate, description, reminderMinutes = 15 } = params;

  let token = await getValidAccessToken();
  if (!token) return null;

  const body = {
    summary: title,
    description: description ?? '',
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: endDate.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: reminderMinutes }],
    },
  };

  const post = async (accessToken: string) =>
    fetch(CALENDAR_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  let res = await post(token);

  if (res.status === 401) {
    // Access token expired — try refresh
    const newToken = await refreshGCalToken();
    if (!newToken) return null;
    res = await post(newToken);
  }

  if (!res.ok) return null;

  const json = await res.json();
  return json.htmlLink ?? null;
}
