import { useState, useEffect } from 'react';

export default function ShareDialog({ tripId, accessToken, onClose }) {
  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState(null);
  const [collaborators, setCollaborators] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [role, setRole] = useState('editor');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

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
      if (data.share?.role) setRole(data.share.role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCollaborators(); }, [tripId]);

  async function handleCreateLink() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/share`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShare(data);
      await fetchCollaborators();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke() {
    try {
      await fetch(`/api/trips/${tripId}/share`, { method: 'DELETE', headers });
      setShare(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemove(userId) {
    try {
      await fetch(`/api/trips/${tripId}/collaborators/${userId}`, { method: 'DELETE', headers });
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

  function copyLink() {
    if (!share?.token) return;
    const url = `${window.location.origin}/trip/${tripId}/join/${share.token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function expiryText() {
    if (!share?.expires_at) return '';
    const diff = new Date(share.expires_at) - new Date();
    if (diff <= 0) return 'Expired';
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return `Expires in ${days} day${days !== 1 ? 's' : ''}`;
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
              {/* Share link section */}
              {isOwner && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Link role:</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>

                  {share ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={copyLink}
                          className="flex-1 px-3 py-2 bg-[#007AFF] text-white text-sm font-medium rounded-xl hover:opacity-90"
                        >
                          {copied ? 'Copied!' : 'Copy Link'}
                        </button>
                        <button
                          onClick={handleRevoke}
                          className="px-3 py-2 border border-red-200 text-red-500 text-sm rounded-xl hover:bg-red-50"
                        >
                          Revoke
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400">{expiryText()}</p>
                        <button
                          onClick={handleCreateLink}
                          className="text-xs text-[#007AFF] hover:underline"
                          disabled={creating}
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateLink}
                      disabled={creating}
                      className="w-full px-3 py-2 bg-[#007AFF] text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-50"
                    >
                      {creating ? 'Creating...' : 'Create Share Link'}
                    </button>
                  )}
                </div>
              )}

              {/* Collaborators list */}
              {collaborators.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Collaborators ({collaborators.length}/5)
                  </p>
                  <div className="space-y-2">
                    {collaborators.map((c) => (
                      <div key={c.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center text-xs font-medium flex-shrink-0">
                            {(c.email?.[0] || '?').toUpperCase()}
                          </div>
                          <span className="text-sm text-gray-700 truncate">{c.email}</span>
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

              {collaborators.length === 0 && !loading && (
                <p className="text-sm text-gray-400 text-center py-2">No collaborators yet</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
