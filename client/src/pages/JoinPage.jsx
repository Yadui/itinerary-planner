import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function JoinPage() {
  const { id, token } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [status, setStatus] = useState('loading'); // loading | success | error | auth_required
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (auth.loading) return;

    if (!auth.isAuthenticated) {
      setStatus('auth_required');
      setMessage('Sign in to join this trip');
      return;
    }

    async function joinTrip() {
      try {
        const res = await fetch(`/api/trips/${id}/join/${token}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.accessToken}`,
          },
        });
        const data = await res.json();

        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'Failed to join trip');
          return;
        }

        setStatus('success');
        setMessage(data.message || `Joined as ${data.role}`);

        // Redirect to trip after short delay
        setTimeout(() => navigate(`/trip/${id}`, { replace: true }), 1500);
      } catch (err) {
        setStatus('error');
        setMessage(err.message);
      }
    }

    joinTrip();
  }, [id, token, auth.loading, auth.isAuthenticated, auth.accessToken]);

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        {status === 'loading' && (
          <>
            <div className="w-10 h-10 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Joining trip...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-xl">
              ✓
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Joined!</h2>
            <p className="text-sm text-gray-500">{message}</p>
            <p className="text-xs text-gray-400 mt-2">Redirecting...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center mx-auto mb-4 text-xl">
              ✗
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Cannot Join</h2>
            <p className="text-sm text-gray-500 mb-4">{message}</p>
            <button
              onClick={() => navigate('/plan')}
              className="px-4 py-2 bg-[#007AFF] text-white text-sm font-medium rounded-xl hover:opacity-90"
            >
              Go Home
            </button>
          </>
        )}

        {status === 'auth_required' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign In Required</h2>
            <p className="text-sm text-gray-500 mb-4">{message}</p>
            <button
              onClick={() => navigate('/plan')}
              className="px-4 py-2 bg-[#007AFF] text-white text-sm font-medium rounded-xl hover:opacity-90"
            >
              Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}
