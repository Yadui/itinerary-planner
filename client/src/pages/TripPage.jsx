import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTrip } from '../hooks/useTrip';
import ItineraryView from '../components/schedule/ItineraryView';
import TripForm from '../components/wizard/TripForm';
import ShareDialog from '../components/ui/ShareDialog';

const EMAIL_DOMAIN = '@trip.io';

function InlineLogin({ onSignIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) return;
    setSubmitting(true);
    setError(null);
    const email = username.includes('@') ? username : username.toLowerCase().trim() + EMAIL_DOMAIN;
    try {
      await onSignIn(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        autoFocus
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
      />
      <button
        type="submit"
        disabled={submitting || !username || !password}
        className="w-full py-2.5 bg-[#007AFF] text-white font-semibold rounded-xl text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  );
}

export default function TripPage() {
  const { id } = useParams();
  const auth = useAuth();
  const { trip, activities, itinerary, loading, error, isDirty, saving, saveStatus, saveTrip, updateItinerary, updateTripConfig } = useTrip(id, auth.accessToken);
  const [showShare, setShowShare] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);

  if (auth.loading || (auth.isAuthenticated && loading)) return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
      <p className="text-gray-400">Loading trip...</p>
    </div>
  );

  if (!auth.isAuthenticated) return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm text-center space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">You're invited!</h2>
          <p className="text-sm text-gray-400 mt-1">Sign in to view this shared trip</p>
        </div>
        <InlineLogin onSignIn={auth.signIn} />
      </div>
    </div>
  );

  if (error && !trip) return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
      <p className="text-red-500">{error}</p>
    </div>
  );

  if (!trip) return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
      <p className="text-gray-400">Trip not found</p>
    </div>
  );

  const isOwner = trip.is_owner;
  const canEdit = trip.role === 'owner' || trip.role === 'editor';

  const statusText = saveStatus === 'saving' ? 'Saving...'
    : saveStatus === 'saved' ? 'Saved'
    : saveStatus === 'conflict_resolved' ? 'Conflict resolved'
    : isDirty ? 'Unsaved' : null;

  const statusColor = saveStatus === 'saved' ? 'text-green-500'
    : saveStatus === 'conflict_resolved' ? 'text-amber-500'
    : isDirty ? 'text-amber-500' : 'text-gray-400';

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{trip.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {isOwner ? 'Your trip' : `Shared (${trip.role})`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {statusText && <span className={`text-xs font-medium ${statusColor}`}>{statusText}</span>}
            {error && <span className="text-xs text-red-500 max-w-[150px] truncate" title={error}>{error}</span>}
            {canEdit && (
              <button
                onClick={() => setShowEditDetails(true)}
                className="px-3 py-2 border border-gray-200 text-gray-600 font-medium rounded-xl text-sm hover:bg-gray-50"
              >
                Edit Details
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setShowShare(true)}
                className="px-3 py-2 border border-gray-200 text-gray-600 font-medium rounded-xl text-sm hover:bg-gray-50"
              >
                Share
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => saveTrip()}
                disabled={saving || !isDirty}
                className="px-4 py-2 bg-[#007AFF] text-white font-semibold rounded-xl text-sm hover:opacity-90 disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        {itinerary && (
          <ItineraryView
            itinerary={itinerary}
            activities={activities}
            tripConfig={trip.config}
            readOnly={!canEdit}
            onItineraryChange={canEdit ? updateItinerary : undefined}
          />
        )}
      </main>

      {showShare && (
        <ShareDialog
          tripId={id}
          accessToken={auth.accessToken}
          onClose={() => setShowShare(false)}
        />
      )}

      {showEditDetails && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowEditDetails(false)}>
          <div className="bg-[#f5f5f7] rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 bg-white rounded-t-2xl border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
              <h2 className="text-lg font-semibold text-gray-900">Edit Trip Details</h2>
              <button
                onClick={() => setShowEditDetails(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <TripForm
                initialValues={trip.config}
                onSubmit={(config) => {
                  updateTripConfig(config);
                  setShowEditDetails(false);
                }}
                submitLabel="Update Details"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
