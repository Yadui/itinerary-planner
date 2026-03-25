import { useState, useEffect } from 'react';

const EMAIL_DOMAIN = '@trip.io';
function displayName(email) {
  if (!email) return '?';
  if (email.endsWith(EMAIL_DOMAIN)) return email.replace(EMAIL_DOMAIN, '');
  return email;
}

const AVATAR_COLORS = [
  '#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE',
  '#5856D6', '#FF2D55', '#00C7BE',
];
function avatarColor(email) {
  let h = 0;
  for (let i = 0; i < (email || '').length; i++) h = ((h << 5) - h + email.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function ShareDialog({ tripId, accessToken, onClose }) {
  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState(null);
  const [collaborators, setCollaborators] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/collaborators`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCollaborators(data.collaborators || []);
      setShare(data.share);
      setIsOwner(data.is_owner);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function ensureLink() {
    try {
      const res = await fetch(`/api/trips/${tripId}/share`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: 'editor' }),
      });
      const data = await res.json();
      if (res.ok) setShare(data);
    } catch {}
  }

  useEffect(() => { load(); }, [tripId]);

  useEffect(() => {
    if (!loading && isOwner && !share) ensureLink();
  }, [loading, isOwner, share]);

  function copyLink() {
    if (!share?.token) return;
    navigator.clipboard.writeText(`${window.location.origin}/trip/${tripId}?join=${share.token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const inviteUrl = share ? `${window.location.origin}/trip/${tripId}?join=${share.token}` : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Invite people</h2>
            <p className="text-xs text-gray-400 mt-0.5">Anyone with the link can join and edit</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {error && <p className="text-sm text-red-500">{error}</p>}

          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-[#007AFF] rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Invite link — only owner sees it */}
              {isOwner && (
                <div className="space-y-2">
                  <button
                    onClick={copyLink}
                    disabled={!inviteUrl}
                    className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                      copied
                        ? 'bg-green-50 text-green-600 border border-green-200'
                        : 'bg-[#007AFF] text-white hover:opacity-90 disabled:opacity-40'
                    }`}
                  >
                    {!inviteUrl ? 'Generating link…' : copied ? '✓ Link copied!' : 'Copy invite link'}
                  </button>
                  {inviteUrl && !copied && (
                    <p className="text-xs text-gray-400 text-center truncate px-1">{inviteUrl}</p>
                  )}
                </div>
              )}

              {/* Who's in */}
              {collaborators.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                    In this trip · {collaborators.length + 1}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {collaborators.map((c) => {
                      const name = displayName(c.email);
                      const color = avatarColor(c.email);
                      return (
                        <div key={c.id} className="flex flex-col items-center gap-1">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                            style={{ backgroundColor: color }}
                          >
                            {name[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="text-xs text-gray-500 max-w-[52px] truncate text-center">{name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Non-owner nudge */}
              {!isOwner && (
                <p className="text-sm text-gray-400 text-center py-2">Ask the trip owner to share the invite link with you.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
