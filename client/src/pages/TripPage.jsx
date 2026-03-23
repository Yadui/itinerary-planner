import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTrip } from '../hooks/useTrip';
import ItineraryView from '../components/schedule/ItineraryView';
import ShareDialog from '../components/ui/ShareDialog';

export default function TripPage() {
  const { id } = useParams();
  const auth = useAuth();
  const { trip, activities, itinerary, loading, error, isDirty, saving, saveStatus, saveTrip, updateItinerary } = useTrip(id, auth.accessToken);
  const [showShare, setShowShare] = useState(false);

  if (loading) return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
      <p className="text-gray-400">Loading trip...</p>
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
            {isOwner && (
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
    </div>
  );
}
