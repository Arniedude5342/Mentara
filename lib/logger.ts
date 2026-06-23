import * as Sentry from '@sentry/react-native';

// Central logging seam. In dev it prints to the console; in release builds it
// forwards to Sentry. Sentry calls are safe even if Sentry.init() never ran
// (no DSN configured) — they simply no-op.

export function logError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (__DEV__) {
    console.error(`[ERROR] ${context}`, err, extra ?? '');
  }
  Sentry.captureException(err, {
    tags: { context },
    extra,
  });
}

export function logEvent(
  name: string,
  data?: Record<string, unknown>,
): void {
  if (__DEV__) {
    console.log(`[EVENT] ${name}`, data ?? '');
  }
  // Recorded as a breadcrumb (not an event) so it enriches error context
  // without consuming the Sentry error quota.
  Sentry.addBreadcrumb({ category: 'event', message: name, data, level: 'info' });
}

// Call this just before an important operation (e.g., sending a message).
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (__DEV__) {
    console.log(`[BREADCRUMB] ${message}`, data ?? '');
  }
  Sentry.addBreadcrumb({ category: 'log', message, data, level: 'info' });
}
