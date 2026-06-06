// ─── Auth Utilities ───────────────────────────────────────────
// Shared helpers used by login and register screens.

/**
 * RFC 5321-compliant email validator.
 * Stricter than the old /\S+@\S+\.\S+/ regex — rejects "a@b", "test@", etc.
 */
export function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(email);
}

/**
 * Password strength scorer.
 * Returns a score (0–3), a label, and a color for the strength bar.
 */
export function getPasswordStrength(password: string): {
  score: 0 | 1 | 2 | 3;
  label: string;
  color: string;
} {
  if (!password || password.length < 8) {
    return { score: 0, label: 'Weak', color: '#EF4444' };
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const criteriaMet = [hasUpper, hasNumber, hasSpecial].filter(Boolean).length;

  if (criteriaMet === 3 && password.length >= 12) {
    return { score: 3, label: 'Very Strong', color: '#6C3AFF' };
  }
  if (criteriaMet >= 2) {
    return { score: 2, label: 'Strong', color: '#10B981' };
  }
  if (criteriaMet >= 1) {
    return { score: 1, label: 'Fair', color: '#F59E0B' };
  }
  return { score: 0, label: 'Weak', color: '#EF4444' };
}

/**
 * Maps raw Supabase error messages to user-friendly strings.
 * Prevents technical jargon from reaching the user.
 */
export function mapAuthError(message: string): string {
  if (!message) return 'Something went wrong. Please try again.';

  const m = message.toLowerCase();

  if (m.includes('invalid login credentials') || m.includes('invalid email or password')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please check your inbox and confirm your email first.';
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (m.includes('password should be at least')) {
    return 'Password must be at least 8 characters.';
  }
  if (m.includes('signup is disabled') || m.includes('signups not allowed')) {
    return 'New registrations are temporarily paused. Please try again later.';
  }
  if (m.includes('rate limit') || m.includes('over_email_send_rate_limit') || m.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (m.includes('network request failed') || m.includes('fetch failed') || m.includes('network error')) {
    return 'No internet connection. Please check your network and try again.';
  }
  if (m.includes('jwt expired') || m.includes('token expired')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (m.includes('email address') && m.includes('invalid')) {
    return 'Please enter a valid email address.';
  }

  // Return original message as fallback — better than a generic message
  // because Supabase errors not in this list are usually readable.
  return message;
}

/**
 * Trims whitespace and lowercases an email input.
 */
export function sanitizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
