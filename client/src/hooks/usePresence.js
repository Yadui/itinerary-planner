import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const HEARTBEAT_INTERVAL = 15000; // 15s
const EXPIRY_MS = 45000; // 45s without heartbeat → remove

/**
 * Strip @trip.io domain from email for display.
 */
export function displayName(email) {
  if (!email) return '?';
  return email.replace(/@trip\.io$/i, '');
}

/**
 * Deterministic color from user id.
 */
const COLORS = [
  '#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE',
  '#5856D6', '#FF2D55', '#00C7BE', '#FF6482', '#30B0C7',
];

export function userColor(userId) {
  if (!userId) return COLORS[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

/**
 * Real-time presence for a trip using Supabase Realtime broadcast.
 *
 * @param {string} tripId
 * @param {{ id: string, email: string } | null} user
 * @param {{ onRemoteUpdate?: fn }} options
 * @returns {{ activeUsers: Map, setEditingTarget: fn, broadcastTripUpdate: fn }}
 */
export function usePresence(tripId, user, { onRemoteUpdate } = {}) {
  const [activeUsers, setActiveUsers] = useState(new Map());
  const editingTargetRef = useRef(null);
  const channelRef = useRef(null);
  const onRemoteUpdateRef = useRef(onRemoteUpdate);
  useEffect(() => { onRemoteUpdateRef.current = onRemoteUpdate; }, [onRemoteUpdate]);

  const setEditingTarget = useCallback((target) => {
    editingTargetRef.current = target || null;
  }, []);

  const broadcastTripUpdate = useCallback(() => {
    if (!channelRef.current || !user?.id) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'trip_updated',
      payload: { user_id: user.id, timestamp: Date.now() },
    });
  }, [user?.id]);

  useEffect(() => {
    if (!tripId || !user?.id || !supabase) return;

    const channel = supabase.channel(`trip:${tripId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    // Listen for heartbeats from others
    channel.on('broadcast', { event: 'presence' }, ({ payload }) => {
      if (!payload?.user_id || payload.user_id === user.id) return;

      setActiveUsers((prev) => {
        const next = new Map(prev);
        next.set(payload.user_id, {
          email: payload.email,
          action: payload.action || 'viewing',
          editing_target: payload.editing_target || null,
          lastSeen: Date.now(),
        });
        return next;
      });
    });

    // Listen for remote trip saves
    channel.on('broadcast', { event: 'trip_updated' }, ({ payload }) => {
      if (!payload?.user_id || payload.user_id === user.id) return;
      onRemoteUpdateRef.current?.();
    });

    // Listen for leave events
    channel.on('broadcast', { event: 'leave' }, ({ payload }) => {
      if (!payload?.user_id) return;
      setActiveUsers((prev) => {
        const next = new Map(prev);
        next.delete(payload.user_id);
        return next;
      });
    });

    channel.subscribe();

    // Send heartbeat
    function sendHeartbeat() {
      channel.send({
        type: 'broadcast',
        event: 'presence',
        payload: {
          user_id: user.id,
          email: user.email,
          action: editingTargetRef.current ? 'editing' : 'viewing',
          editing_target: editingTargetRef.current,
          timestamp: Date.now(),
        },
      });
    }

    // Initial heartbeat + interval
    sendHeartbeat();
    const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Expire stale users
    const expiryTimer = setInterval(() => {
      const now = Date.now();
      setActiveUsers((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [uid, data] of next) {
          if (now - data.lastSeen > EXPIRY_MS) {
            next.delete(uid);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 10000);

    // Cleanup
    return () => {
      clearInterval(heartbeatTimer);
      clearInterval(expiryTimer);
      // Notify others we're leaving
      channel.send({
        type: 'broadcast',
        event: 'leave',
        payload: { user_id: user.id },
      });
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [tripId, user?.id, user?.email]);

  return { activeUsers, setEditingTarget, broadcastTripUpdate };
}
