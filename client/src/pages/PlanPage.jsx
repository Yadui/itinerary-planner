import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useTrip } from '../hooks/useTrip';
import { useLocalDraft, loadDraft, clearDraft } from '../hooks/useLocalDraft';
import AuthBar from '../components/ui/AuthBar';
import TripForm from '../components/wizard/TripForm';
import ActivityList from '../components/discovery/ActivityList';
import ItineraryView from '../components/schedule/ItineraryView';
import DirectionsMap from '../components/schedule/DirectionsMap';
import HealthIndicator from '../components/ui/HealthIndicator';
import { CheckIcon, MapIcon, ListIcon, PinIcon, CalendarIcon, LoaderIcon } from '../components/ui/Icons';

const STEPS = { FORM: 'form', ACTIVITIES: 'activities', ITINERARY: 'itinerary' };

function getInitialState() {
  const draft = loadDraft();
  if (draft) {
    return {
      step: draft.step || STEPS.FORM,
      tripConfig: draft.tripConfig || null,
      selectedActivities: draft.selectedActivities || [],
      itinerary: draft.itinerary || null,
    };
  }
  return { step: STEPS.FORM, tripConfig: null, selectedActivities: [], itinerary: null };
}

export default function PlanPage() {
  const navigate = useNavigate();
  const auth = useAuth();

  const initial = getInitialState();
  const [step, setStep] = useState(initial.step);
  const [tripConfig, setTripConfig] = useState(initial.tripConfig);
  const [selectedActivities, setSelectedActivities] = useState(initial.selectedActivities);
  const [itinerary, setItinerary] = useState(initial.itinerary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tripId, setTripId] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDirections, setShowDirections] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [savedTrips, setSavedTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [loadingTripId, setLoadingTripId] = useState(null);

  // Auto-save progress to localStorage (debounced 1s)
  useLocalDraft({ step, tripConfig, selectedActivities, itinerary });

  // Fetch saved trips when authenticated and on form step
  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken || step !== STEPS.FORM) return;
    setLoadingTrips(true);
    api.listTrips(auth.accessToken)
      .then((trips) => setSavedTrips(trips))
      .catch(() => {}) // silent fail
      .finally(() => setLoadingTrips(false));
  }, [auth.isAuthenticated, auth.accessToken, step]);

  function loadSavedTrip(id) {
    navigate(`/trip/${id}`);
  }

  function handleTripSubmit(config) {
    setTripConfig(config);
    setStep(STEPS.ACTIVITIES);
  }

  function toggleActivity(activity) {
    setSelectedActivities((prev) =>
      prev.find((a) => a.id === activity.id)
        ? prev.filter((a) => a.id !== activity.id)
        : [...prev, activity]
    );
  }

  async function handleGenerateItinerary() {
    if (!selectedActivities.length) return;
    setLoading(true);
    setError(null);
    try {
      const firstCity = tripConfig.cities[0];
      const lastCity = tripConfig.cities[tripConfig.cities.length - 1];
      // Build city schedule with transport arrival/departure times
      const citySchedule = tripConfig.cities.map((c, idx) => {
        const entry = { name: c.name, arrival: c.arrival, departure: c.departure };
        // Add transport arrival time from previous leg
        if (idx > 0 && tripConfig.busDetails?.[idx - 1]?.arrivalTime) {
          entry.arrivalTime = tripConfig.busDetails[idx - 1].arrivalTime;
        }
        // Add transport departure time for this leg
        if (tripConfig.busDetails?.[idx]?.departureTime) {
          entry.departureTime = tripConfig.busDetails[idx].departureTime;
        }
        return entry;
      });

      const result = await api.generateSchedule({
        trip: {
          start_date: firstCity.arrival,
          end_date: lastCity.departure,
          stay_location: firstCity.stayLocation ?? selectedActivities[0]?.location ?? { lat: 0, lng: 0 },
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
        travel_mode: tripConfig.localTransport === 'Walk' ? 'walking'
          : tripConfig.localTransport === 'Subway / Transit' ? 'transit'
          : 'driving',
      });
      setItinerary(result);
      setIsDirty(true);
      setStep(STEPS.ITINERARY);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Called by ItineraryView on any edit (drag, remove, optimize)
  const handleItineraryChange = useCallback((newItinerary) => {
    setItinerary(newItinerary);
    setIsDirty(true);
  }, []);

  async function handleSave() {
    if (!auth.isAuthenticated) return;
    setSaving(true);
    setError(null);

    try {
      const firstCity = tripConfig.cities[0];
      const lastCity = tripConfig.cities[tripConfig.cities.length - 1];
      const tripData = {
        name: tripConfig.cities.map((c) => c.name).join(' → '),
        start_date: firstCity.arrival,
        end_date: lastCity.departure,
        stay_location: selectedActivities[0]?.location ?? null,
        config: tripConfig,
      };

      let id = tripId;

      if (!id) {
        // Create trip first
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` };
        const res = await fetch('/api/trips', { method: 'POST', headers, body: JSON.stringify(tripData) });
        const created = await res.json();
        if (!res.ok) throw new Error(created.error);
        id = created.id;
        setTripId(id);
      }

      // Full save
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` };
      const saveRes = await fetch(`/api/trips/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          trip: tripData,
          activities: itinerary?.activities ?? selectedActivities.map((a) => ({
            place_id: a.id,
            name: a.name,
            lat: a.location?.lat,
            lng: a.location?.lng,
            duration: a.duration ?? 75,
            rating: a.rating,
            types: a.types,
            address: a.address,
            source: a.source || null,
          })),
          itinerary: itinerary ? {
            days: itinerary.days.map((day) => ({
              date: day.date,
              city: day.city,
              items: day.items.map((item) => ({
                place_id: item.place_id,
                start_time: item.start_time,
                end_time: item.end_time,
              })),
            })),
          } : null,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error);

      setIsDirty(false);
      clearDraft(); // Saved to server — no need for local draft
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (step === STEPS.ITINERARY) setStep(STEPS.ACTIVITIES);
    else if (step === STEPS.ACTIVITIES) setStep(STEPS.FORM);
  }

  function startOver() {
    clearDraft();
    setStep(STEPS.FORM);
    setTripConfig(null);
    setSelectedActivities([]);
    setItinerary(null);
    setTripId(null);
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Minimal header — only shows on Activities/Itinerary steps */}
      {step !== STEPS.FORM && (
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={goBack} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                ← Back
              </button>
              <span className="text-sm font-medium text-gray-900">
                {step === STEPS.ACTIVITIES ? 'Pick Activities' : 'Your Itinerary'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {step === STEPS.ITINERARY && (
                <>
                  {tripId && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/trip/${tripId}`);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      }}
                      className={`text-xs font-medium transition-colors ${linkCopied ? 'text-green-600' : 'text-[#007AFF] hover:opacity-70'}`}
                    >
                      {linkCopied ? <><CheckIcon className="inline" /> Link copied</> : 'Copy link'}
                    </button>
                  )}
                  {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved changes" />}
                  <button
                    onClick={handleSave}
                    disabled={saving || !auth.isAuthenticated}
                    className="px-3 py-1.5 bg-[#007AFF] text-white font-semibold rounded-lg text-xs hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    {saving ? 'Saving…' : !auth.isAuthenticated ? 'Sign in' : isDirty ? 'Save' : <><CheckIcon className="inline mr-0.5" />Saved</>}
                  </button>
                </>
              )}
              <button onClick={startOver} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                Start over
              </button>
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
      )}

      {/* Form step has its own minimal header */}
      {step === STEPS.FORM && (
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">Trip Planner</span>
            <div className="flex items-center gap-3">
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
      )}

      <main className={`mx-auto px-4 pb-24 ${step === STEPS.ACTIVITIES ? 'max-w-6xl' : 'max-w-3xl'}`}>
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        {step === STEPS.FORM && (
          <>
            <TripForm onSubmit={handleTripSubmit} initialValues={tripConfig} />

            {/* Saved trips */}
            {auth.isAuthenticated && (
              <section className="mt-8 mb-12">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Trips</h2>
                {loadingTrips ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : savedTrips.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No saved trips yet. Plan your first trip above!</p>
                ) : (
                  <div className="space-y-3">
                    {savedTrips.map((trip) => {
                      const cities = trip.config?.cities?.map((c) => c.name).filter(Boolean) || [];
                      const dateRange = trip.start_date && trip.end_date
                        ? `${new Date(trip.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(trip.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : '';
                      return (
                        <button
                          key={trip.id}
                          onClick={() => loadSavedTrip(trip.id)}
                          disabled={loadingTripId === trip.id}
                          className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md hover:border-[#007AFF]/30 transition-all group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {trip.name || 'Untitled Trip'}
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {trip.updated_at && (
                                  <span className="text-[11px] text-gray-300">
                                    Saved {new Date(trip.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(trip.updated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  </span>
                                )}
                                {trip.updated_at && dateRange && (
                                  <span className="text-xs text-gray-200">•</span>
                                )}
                                {dateRange && (
                                  <span className="text-xs text-gray-400">{dateRange}</span>
                                )}
                                {cities.length > 0 && (
                                  <span className="text-xs text-gray-300">•</span>
                                )}
                                {cities.slice(0, 3).map((c, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-gray-50 rounded-full text-xs text-gray-500">
                                    {c}
                                  </span>
                                ))}
                                {cities.length > 3 && (
                                  <span className="text-xs text-gray-400">+{cities.length - 3}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {trip.shared && (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-medium">
                                  {trip.role === 'owner' ? 'Shared' : trip.role}
                                </span>
                              )}
                              <span className="text-gray-300 group-hover:text-[#007AFF] transition-colors text-sm">
                                {loadingTripId === trip.id ? <LoaderIcon className="animate-spin" /> : '→'}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {step === STEPS.ACTIVITIES && (
          <ActivityList
            tripConfig={tripConfig}
            selectedActivities={selectedActivities}
            onToggle={toggleActivity}
            onGenerate={handleGenerateItinerary}
            loading={loading}
          />
        )}

        {step === STEPS.ITINERARY && itinerary && (
          <>
            {/* Directions button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowDirections(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm text-sm font-medium text-[#007AFF] hover:bg-gray-50 transition-colors"
              >
                <MapIcon /> View Directions
              </button>
            </div>

            <ItineraryView
              itinerary={itinerary}
              activities={selectedActivities}
              tripConfig={tripConfig}
              onItineraryChange={handleItineraryChange}
            />

          </>
        )}
      </main>

      {/* Floating bottom step tabs */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
        <div className="flex items-center bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200/60 p-1.5 gap-1">
          {[
            { key: STEPS.FORM, label: 'Trip Details', Icon: ListIcon, num: 1 },
            { key: STEPS.ACTIVITIES, label: 'Activities', Icon: PinIcon, num: 2 },
            { key: STEPS.ITINERARY, label: 'Itinerary', Icon: CalendarIcon, num: 3 },
          ].map((tab) => {
            const isActive = step === tab.key;
            const isReachable =
              tab.key === STEPS.FORM ||
              (tab.key === STEPS.ACTIVITIES && tripConfig) ||
              (tab.key === STEPS.ITINERARY && itinerary);
            return (
              <button
                key={tab.key}
                onClick={() => isReachable && setStep(tab.key)}
                disabled={!isReachable}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : isReachable
                      ? 'text-gray-600 hover:bg-gray-100'
                      : 'text-gray-300 cursor-not-allowed'
                }`}
              >
                <tab.Icon className="text-xs" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.num}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Directions map modal */}
      {showDirections && itinerary && (
        <DirectionsMap
          itinerary={itinerary}
          tripConfig={tripConfig}
          onClose={() => setShowDirections(false)}
        />
      )}
    </div>
  );
}
