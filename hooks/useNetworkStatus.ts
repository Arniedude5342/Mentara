import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';

const CHECK_URL = 'https://clients3.google.com/generate_204';
const POLL_INTERVAL_MS = 9000;
const TIMEOUT_MS = 5000;

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  const check = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      await fetch(CHECK_URL, { method: 'HEAD', signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') check();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [check]);

  return isOnline;
}
