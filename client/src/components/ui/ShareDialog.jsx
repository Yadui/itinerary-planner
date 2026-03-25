import { useState, useEffect, useRef } from 'react';

const EMAIL_DOMAIN = '@trip.io';
function displayName(email) {
  if (!email) return '?';
  if (email.endsWith(EMAIL_DOMAIN)) return email.replace(EMAIL_DOMAIN, '');
  return email;
}

export default function ShareDialog({ tripId, accessToken, onClose }) {
  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState(null);
  const [collaborators, setCollaborators] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  // Invite state
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const suggestTimerRef = useRef(null);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  async function fetchCollaborators() {
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

  // Auto-create share link if owner and none exists
  async function ensureShareLink() {
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

  useEffect(() => {
    fetchCollaborators();
  }, [tripId]);

  // Auto-create link once we know user is owner and there's no link
  useEffect(() => {
    if (!loading && isOwner && !share) {
      ensureShareLink();
    }
  }, [loading, isOwner, share]);

  async function handleRevoke() {
    try {
      const res = await fetch(`/api/trips/${tripId}/share`, { method: 'DELETE', headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke');
      }
      setShare(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemove(userId) {
    try {
      const res = await fetch(`/api/trips/${tripId}/collaborators/${userId}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove');
      }
      setCollaborators((prev) => prev.filter((c) => c.user_id !== userId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTransfer(userId) {
    if (!confirm('Transfer ownership? You will become an editor.')) return;
    try {
      const res = await fetch(`/api/trips/${tripId}/transfer`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ new_owner_id: userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await fetchCollaborators();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleUsernameChange(val) {
    setInviteUsername(val);
    setInviteSuccess(null);
    clearTimeout(suggestTimerRef.current);
    if (val.trim().length < 1) { setSuggestions([]); return; }
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(val.trim())}`, { headers });
        if (res.ok) setSuggestions(await res.json());
      } catch {}
    }, 250);
  }

  function pickSuggestion(username) {
    setInviteUsername(username);
    setSuggestions([]);
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteUsername.trim()) return;
    setInviting(true);
    setInviteSuccess(null);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/collaborators`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ username: inviteUsername.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInviteSuccess(`Added ${displayName(data.email)}`);
      setInviteUsername('');
      await fetchCollaborators();
    } catch (err) {
      setError(err.message);
    } finally {
      setInviting(false);
    }
  }

  function copyLink() {
    if (!share?.token) return;
    const url = `${window.location.origin}/trip/${tripId}?join=${share.token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Share Trip</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {error && <p className="text-sm text-red-500">{error}</p>}

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading...</p>
          ) : (
            <>
              {/* Invite by username */}
              {isOwner && (
                <form onSubmit={handleInvite} className="space-y-2">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Add people</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={inviteUsername}
                        onChange={(e) => handleUsernameChange(e.target.value)}
                        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                        placeholder="Username"
                        autoComplete="off"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
                      />
                      {suggestions.length > 0 && (
                        <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                          {suggestions.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                onMouseDown={() => pickSuggestion(s.username)}
                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                {s.username}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="text-sm border border-gray-200 rounded-xl px-2 py-2"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      type="submit"
                      disabled={inviting || !inviteUsername.trim()}
                      className="px-3 py-2 bg-[#007AFF] text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-40"
                    >
                      {inviting ? '…' : 'Add'}
                    </button>
                  </div>
                  {inviteSuccess && <p className="text-xs text-green-600">{inviteSuccess}</p>}
                </form>
              )}

              {/* Share link */}
              {isOwner && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Share link</label>
                  <div className="flex gap-2">
                    <button
                      onClick={copyLink}
                      disabled={!share}
                      className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-xl hover:bg-gray-200 disabled:opacity-40 text-left truncate"
                    >
                      {share ? (copied ? '✓ Copied!' : `${window.location.origin}/trip/${tripId}?join=…`) : 'Generating…'}
                    </button>
                    <button
                      onClick={copyLink}
                      disabled={!share}
                      className="px-3 py-2 bg-[#007AFF] text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-40"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  {share && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">
                        {share.role} access · {(() => {
                          const diff = new Date(share.expires_at) - new Date();
                          if (diff <= 0) return 'Expired';
                          const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                          return `Expires in ${days}d`;
                        })()}
                      </p>
                      <button onClick={handleRevoke} className="text-xs text-red-400 hover:text-red-600">
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Collaborators list */}
              {collaborators.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Collaborators ({collaborators.length}/5)
                  </p>
                  <div className="space-y-1">
                    {collaborators.map((c) => (
                      <div key={c.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center text-xs font-medium flex-shrink-0">
                            {displayName(c.email)[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="text-sm text-gray-700 truncate">{displayName(c.email)}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
                            {c.role}
                          </span>
                        </div>
                        {isOwner && (
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <button
                              onClick={() => handleTransfer(c.user_id)}
                              className="text-xs text-gray-400 hover:text-[#007AFF] px-1"
                              title="Transfer ownership"
                            >
                              Transfer
                            </button>
                            <button
                              onClick={() => handleRemove(c.user_id)}
                              className="text-xs text-gray-400 hover:text-red-500 px-1"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {collaborators.length === 0 && !loading && !isOwner && (
                <p className="text-sm text-gray-400 text-center py-2">No collaborators</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
