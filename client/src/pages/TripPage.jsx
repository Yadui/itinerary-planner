import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTrip } from '../hooks/useTrip';
import { api } from '../lib/api';
import ItineraryView from '../components/schedule/ItineraryView';
import ActivityList from '../components/discovery/ActivityList';
import DirectionsMap from '../components/schedule/DirectionsMap';
import TripForm from '../components/wizard/TripForm';
import ShareDialog from '../components/ui/ShareDialog';
import HealthIndicator from '../components/ui/HealthIndicator';
import AuthBar from '../components/ui/AuthBar';

const EMAIL_DOMAIN = '@trip.io';
const TABS = { ACTIVITIES: 'activities', ITINERARY: 'itinerary' };

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
      <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoFocus
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]" />
      <button type="submit" disabled={submitting || !username || !password}
        className="w-full py-2.5 bg-[#007AFF] text-white font-semibold rounded-xl text-sm hover:opacity-90 disabled:opacity-40 transition-opacity">
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  );
}

export default function TripPage() {
  const { id } = useParams();
  const auth = useAuth();
  const { trip, activities, itinerary, loading, error, isDirty, saving, saveStatus, saveTrip, updateItinerary, updateActivities, updateTripConfig } = useTrip(id, auth.accessToken);
  const [activeTab, setActiveTab] = useState(TABS.ACTIVITIES);
  const [showShare, setShowShare] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [showDirections, setShowDirections] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  // Reconstruct selectedActivities from trip data for ActivityList
  const selectedActivities = (activities || []).map((a) => ({
    id: a.place_id,
    name: a.name,
    location: { lat: a.lat, lng: a.lng },
    duration: a.duration,
    rating: a.rating || a.metadata?.rating,
    priceLevel: a.price_level ?? a.metadata?.price_level,
    types: a.types || a.metadata?.types || [],
    address: a.address || a.metadata?.address || '',
    photo: a.photo || a.metadata?.photo,
    city: a.city,
  }));

  function toggleActivity(activity) {
    const current = selectedActivities;
    const exists = current.find((a) => a.id === activity.id);
    const updated = exists
      ? current.filter((a) => a.id !== activity.id)
      : [...current, activity];

    // Convert back to storage format
    const storageFormat = updated.map((a) => ({
      place_id: a.id,
      name: a.name,
      lat: a.location?.lat,
      lng: a.location?.lng,
      duration: a.duration ?? 75,
      rating: a.rating,
      types: a.types,
      address: a.address,
      city: a.city,
    }));
    if (updateActivities) updateActivities(storageFormat);
  }

  async function handleGenerateItinerary() {
    if (!selectedActivities.length || !trip?.config) return;
    setGenerating(true);
    setGenError(null);
    try {
      const config = trip.config;
      const firstCity = config.cities[0];
      const lastCity = config.cities[config.cities.length - 1];
      const citySchedule = config.cities.map((c, idx) => {
        const entry = { name: c.name, arrival: c.arrival, departure: c.departure };
        if (idx > 0 && config.busDetails?.[idx - 1]?.arrivalTime) {
          entry.arrivalTime = config.busDetails[idx - 1].arrivalTime;
        }
        if (config.busDetails?.[idx]?.departureTime) {
          entry.departureTime = config.busDetails[idx].departureTime;
        }
        return entry;
      });

      const result = await api.generateSchedule({
        trip: {
          start_date: firstCity.arrival,
          end_date: lastCity.departure,
          stay_location: selectedActivities[0]?.location ?? { lat: 0, lng: 0 },
          cities: citySchedule,
        },
        activities: selectedActivities.map((a) => ({
          place_id: a.id,
          name: a.name,
          lat: a.location?.lat,
          lng: a.location?.lng,
          types: a.types,
          rating: a.rating,
          priceLevel: a.priceLevel,
          address: a.address,
          city: a.city,
        })),
        travel_mode: config.localTransport === 'Walk' ? 'walking'
          : config.localTransport === 'Subway / Transit' ? 'transit'
          : 'driving',
      });
      updateItinerary(result);
      setActiveTab(TABS.ITINERARY);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  const handleItineraryChange = useCallback((newItinerary) => {
    updateItinerary(newItinerary);
  }, [updateItinerary]);

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/trip/${id}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  // Loading/auth states
  if (auth.loading || (auth.isAuthenticated && loading)) return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#007AFF] rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Loading trip...</p>
      </div>
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
    <div className="min-h-screen bg-[#f5f5f7] pb-20">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 tracking-tight truncate">{trip.name}</h1>
            <p className="text-xs text-gray-400">
              {isOwner ? 'Your trip' : `Shared (${trip.role})`}
              {statusText && <span className={`ml-2 ${statusColor}`}>{statusText}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={copyLink}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                linkCopied
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {linkCopied ? '✓ Copied' : 'Copy link'}
            </button>
            {canEdit && (
              <button
                onClick={() => setShowShare(true)}
                className="px-3 py-1.5 bg-gray-50 text-gray-500 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100"
              >
                Share
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => saveTrip()}
                disabled={saving || !isDirty}
                className="px-3 py-1.5 bg-[#007AFF] text-white font-semibold rounded-lg text-xs hover:opacity-90 disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            <HealthIndicator />
            <AuthBar
              user={auth.user}
              loading={auth.loading}
              onSignIn={auth.signIn}
              onSignUp={auth.signUp}
              onSignOut={auth.signOut}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className={`mx-auto px-4 py-6 ${activeTab === TABS.ACTIVITIES ? 'max-w-6xl' : 'max-w-3xl'}`}>
        {(error || genError) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error || genError}
          </div>
        )}

        {activeTab === TABS.ACTIVITIES && trip.config && (
          <ActivityList
            tripConfig={trip.config}
            selectedActivities={selectedActivities}
            onToggle={canEdit ? toggleActivity : undefined}
            onGenerate={canEdit ? handleGenerateItinerary : undefined}
            loading={generating}
          />
        )}

        {activeTab === TABS.ITINERARY && itinerary && (
          <>
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => setShowDirections(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm text-sm font-medium text-[#007AFF] hover:bg-gray-50 transition-colors"
              >
                <span>🗺️</span> View Directions
              </button>
            </div>
            <ItineraryView
              itinerary={itinerary}
              activities={selectedActivities}
              tripConfig={trip.config}
              readOnly={!canEdit}
              onItineraryChange={canEdit ? handleItineraryChange : undefined}
            />
          </>
        )}

        {activeTab === TABS.ITINERARY && !itinerary && (
          <div className="text-center py-16 space-y-3">
            <p className="text-gray-400">No itinerary generated yet</p>
            {canEdit && selectedActivities.length > 0 && (
              <button
                onClick={handleGenerateItinerary}
                disabled={generating}
                className="px-5 py-2.5 bg-[#007AFF] text-white font-semibold rounded-xl text-sm hover:opacity-90 disabled:opacity-40"
              >
                {generating ? 'Generating…' : 'Generate Itinerary'}
              </button>
            )}
            {selectedActivities.length === 0 && (
              <button
                onClick={() => setActiveTab(TABS.ACTIVITIES)}
                className="text-sm text-[#007AFF] hover:underline"
              >
                Add activities first →
              </button>
            )}
          </div>
        )}
      </main>

      {/* Floating bottom tabs */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20">
        <div className="flex bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          {canEdit && (
            <button
              onClick={() => setShowEditDetails(true)}
              className="px-4 py-3 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors border-r border-gray-100"
            >
              <span className="block text-base mb-0.5">⚙️</span>
              Details
            </button>
          )}
          <button
            onClick={() => setActiveTab(TABS.ACTIVITIES)}
            className={`px-5 py-3 text-xs font-medium transition-colors ${
              activeTab === TABS.ACTIVITIES
                ? 'text-[#007AFF] bg-[#007AFF]/5'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <span className="block text-base mb-0.5">📍</span>
            Activities
            {selectedActivities.length > 0 && (
              <span className="ml-1 text-[10px] bg-gray-100 rounded-full px-1.5 py-0.5">
                {selectedActivities.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab(TABS.ITINERARY)}
            className={`px-5 py-3 text-xs font-medium transition-colors ${
              activeTab === TABS.ITINERARY
                ? 'text-[#007AFF] bg-[#007AFF]/5'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <span className="block text-base mb-0.5">📋</span>
            Itinerary
            {itinerary && <span className="ml-1 text-[10px] text-green-500">✓</span>}
          </button>
        </div>
      </div>

      {/* Modals */}
      {showShare && (
        <ShareDialog tripId={id} accessToken={auth.accessToken} onClose={() => setShowShare(false)} />
      )}

      {showEditDetails && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowEditDetails(false)}>
          <div className="bg-[#f5f5f7] rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 bg-white rounded-t-2xl border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
              <h2 className="text-lg font-semibold text-gray-900">Edit Trip Details</h2>
              <button onClick={() => setShowEditDetails(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">✕</button>
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

      {showDirections && itinerary && (
        <DirectionsMap itinerary={itinerary} tripConfig={trip.config} onClose={() => setShowDirections(false)} />
      )}
    </div>
  );
}
