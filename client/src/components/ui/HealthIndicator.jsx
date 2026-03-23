import { useState, useEffect, useRef } from 'react';

function StatusDot({ ok, label, detail, loading }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${loading ? 'bg-gray-300 animate-pulse' : ok ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-sm text-gray-700">{label}</span>
      {detail && <span className="text-xs text-gray-400 ml-auto max-w-[120px] truncate" title={detail}>{detail}</span>}
    </div>
  );
}

export default function HealthIndicator() {
  const [health, setHealth] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function fetchHealth() {
    if (loading) return;
    setLoading(true);
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        setHealth(data);
        setFetched(true);
      })
      .catch(() => {
        setHealth({ server: { ok: false, error: 'Unreachable' }, google: { ok: false }, claude: { ok: false }, azure: { ok: false } });
        setFetched(true);
      })
      .finally(() => setLoading(false));
  }

  function handleToggle() {
    if (!fetched) fetchHealth();
    setOpen(!open);
  }

  function handleRetry() {
    fetchHealth();
  }

  const aiOk = health && (health.claude?.ok || health.azure?.ok);
  const allOk = health && health.server?.ok && health.google?.ok && aiOk;
  const anyDown = health && (!health.server?.ok || !health.google?.ok || !aiOk);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        onMouseEnter={() => { if (!fetched) fetchHealth(); }}
        className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center text-xs text-gray-400 hover:border-[#007AFF] hover:text-[#007AFF] transition-colors relative"
        title="Service health"
      >
        i
        {health && !loading && (
          <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${allOk ? 'bg-green-500' : 'bg-red-500'}`} />
        )}
        {loading && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg p-3 z-50">
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Service Status</p>
          <div className="divide-y divide-gray-100">
            <StatusDot loading={loading} ok={health?.server?.ok} label="Backend Server" />
            <StatusDot
              loading={loading}
              ok={health?.google?.ok}
              label="Google Places"
              detail={!loading ? (health?.google?.error || (health?.google?.ok ? '' : health?.google?.status)) : ''}
            />
            <StatusDot
              loading={loading}
              ok={health?.claude?.ok}
              label="Claude AI"
              detail={!loading ? (health?.claude?.error || '') : ''}
            />
            <StatusDot
              loading={loading}
              ok={health?.azure?.ok}
              label="Azure OpenAI"
              detail={!loading ? (health?.azure?.error || '') : ''}
            />
          </div>
          {!loading && anyDown && (
            <button
              onClick={handleRetry}
              className="mt-2 text-xs text-[#007AFF] hover:underline w-full text-center"
            >
              Retry
            </button>
          )}
          {loading && (
            <p className="mt-2 text-xs text-gray-400 text-center">Checking...</p>
          )}
        </div>
      )}
    </div>
  );
}
