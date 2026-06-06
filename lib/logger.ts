export function logError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  if (__DEV__) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[ERROR] ${context}`, err, extra ?? '');
  }
  // no-op in production — Sentry has been removed
}

export function logEvent(
  name: string,
  data?: Record<string, unknown>,
): void {
  if (__DEV__) {
    console.log(`[EVENT] ${name}`, data ?? '');
  }
  // no-op in production
}

// Call this just before an important operation (e.g., sending a message).
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (__DEV__) {
    console.log(`[BREADCRUMB] ${message}`, data ?? '');
  }
  // no-op in production
}
