import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, sendMessage as sendMsg, getMessages, getConversations } from '@/lib/supabase';
import { Message, Conversation } from '@/lib/types';

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    // Deduplicate concurrent fetches: Realtime events can fire immediately after
    // mount, causing two simultaneous requests for the same data.
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const { data, error: fetchError } = await getMessages(conversationId);
      if (!mountedRef.current) return;
      if (fetchError) {
        setError((fetchError as any).message ?? 'Failed to load messages');
      } else {
        if (data) setMessages(data as Message[]);
      }
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message ?? 'Failed to load messages');
    } finally {
      fetchingRef.current = false;
      // Always reset loading — even on thrown errors — so the UI doesn't freeze
      if (mountedRef.current) setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!conversationId) {
      setLoading(false);
      return () => { mountedRef.current = false; };
    }
    fetchMessages();

    // Real-time subscription — channel name is unique per conversation so
    // messages from other conversations never leak to this subscriber.
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!mountedRef.current) return;
          setMessages((prev) => {
            // Deduplicate: realtime may fire for a message we already appended optimistically
            if (prev.some((m) => m.id === (payload.new as Message).id)) return prev;
            return [...prev, payload.new as Message];
          });
        }
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchMessages]);

  const send = useCallback(async (senderId: string, content: string): Promise<{ error: unknown }> => {
    const trimmed = content.trim();
    if (!trimmed || !conversationId) return { error: null };
    const { error } = await sendMsg(conversationId, senderId, trimmed);
    return { error };
  }, [conversationId]);

  return { messages, loading, error, send };
}

// Module-level cache so re-focusing the tab shows cached data instantly (no spinner flash).
// Keyed by userId. When the active user changes (sign-out → sign-in), the previous user's
// entry is cleared so they cannot briefly see another account's conversations.
const _convCache = new Map<string, any[]>();
let _activeCachedUserId: string | null = null;

function _purgeOtherCacheEntries(currentUserId: string) {
  if (_activeCachedUserId && _activeCachedUserId !== currentUserId) {
    _convCache.delete(_activeCachedUserId);
  }
  _activeCachedUserId = currentUserId;
}

export function useConversations(userId: string) {
  const cached = userId ? (_convCache.get(userId) ?? []) : [];
  const [conversations, setConversations] = useState<Conversation[]>(cached);
  const [loading, setLoading] = useState(cached.length === 0);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Purge previous user's cache after render (not during render phase)
  useEffect(() => {
    if (userId) _purgeOtherCacheEntries(userId);
  }, [userId]);

  const fetch = useCallback(async () => {
    if (!userId) return;
    // Deduplicate concurrent fetches: Realtime events fire from two channel
    // filters and can overlap with the initial mount fetch.
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const { data, error: fetchError } = await getConversations(userId);
      if (!mountedRef.current) return;
      if (fetchError) {
        setError((fetchError as any).message ?? 'Failed to load conversations');
      } else {
        if (data) {
          _convCache.set(userId, data);
          setConversations(data);
        }
      }
      setLoading(false);
    } finally {
      fetchingRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    mountedRef.current = true;
    fetch();
    // Use a single channel with two filters — one subscription per user, not two,
    // which halves the Realtime connection count at scale.
    const debouncedFetch = () => {
      if (!mountedRef.current) return;
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => {
        if (mountedRef.current) fetch();
      }, 300);
    };

    const channel = supabase
      .channel(`conversations:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `student_id=eq.${userId}` },
        debouncedFetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `mentor_id=eq.${userId}` },
        debouncedFetch
      )
      .subscribe();
    return () => {
      mountedRef.current = false;
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, fetch]);

  return { conversations, loading, error, refetch: fetch };
}
