import { useEffect, useState, useMemo, useRef } from 'react';
import { api } from '../../lib/api';
import ActivityCard from './ActivityCard';

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'restaurant', label: 'Food' },
  { key: 'museum', label: 'Museums' },
  { key: 'park', label: 'Nature' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'night_club', label: 'Nightlife' },
  { key: 'tourist_attraction', label: 'Attractions' },
];

const RATING_FILTERS = [
  { key: 0, label: 'Any rating' },
  { key: 3, label: '3+ ★' },
  { key: 4, label: '4+ ★' },
  { key: 4.5, label: '4.5+ ★' },
];

const PRICE_FILTERS = [
  { key: -1, label: 'Any price' },
  { key: 0, label: 'Free' },
  { key: 1, label: '$' },
  { key: 2, label: '$$' },
  { key: 3, label: '$$$' },
];

export default function ActivityList({ tripConfig, selectedActivities, onToggle, onGenerate, loading }) {
  const [places, setPlaces] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState(0);
  const [priceFilter, setPriceFilter] = useState(-1);
  const [cityFilter, setCityFilter] = useState('all');
  const [showSelected, setShowSelected] = useState(false);
  const [showInstagram, setShowInstagram] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Instagram import
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState('text'); // 'text' or 'url'
  const [importInput, setImportInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importProgress, setImportProgress] = useState(null); // { current, total }
  const [addedImports, setAddedImports] = useState(new Set()); // track which imported items were added

  // Custom search
  const [customSearch, setCustomSearch] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    async function fetchPlaces() {
      setFetching(true);
      setError(null);
      try {
        const results = await Promise.all(
          tripConfig.cities.flatMap((city) =>
            (tripConfig.interests.length ? tripConfig.interests.slice(0, 3) : ['top attractions']).map((interest) =>
              api.searchPlaces(city.name, interest).then((places) =>
                places.map((p) => ({ ...p, city: city.name }))
              )
            )
          )
        );
        const seen = new Set();
        const all = results.flat().filter((p) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
        all.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        setPlaces(all);
      } catch (err) {
        setError(err.message);
      } finally {
        setFetching(false);
      }
    }
    fetchPlaces();
  }, [tripConfig]);

  const selectedIds = new Set(selectedActivities.map((a) => a.id));

  // Track pinned IDs — selected items get pinned to top after 2.5s delay
  const [pinnedIds, setPinnedIds] = useState(new Set());
  const pinTimers = useRef(new Map());

  // When an activity is selected, schedule pinning after 2.5s
  // When deselected, unpin immediately
  useEffect(() => {
    const currentSelected = new Set(selectedActivities.map((a) => a.id));

    // Schedule pin for newly selected
    for (const id of currentSelected) {
      if (!pinnedIds.has(id) && !pinTimers.current.has(id)) {
        const timer = setTimeout(() => {
          setPinnedIds((prev) => new Set([...prev, id]));
          pinTimers.current.delete(id);
        }, 2500);
        pinTimers.current.set(id, timer);
      }
    }

    // Unpin deselected
    for (const id of pinnedIds) {
      if (!currentSelected.has(id)) {
        setPinnedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (pinTimers.current.has(id)) {
          clearTimeout(pinTimers.current.get(id));
          pinTimers.current.delete(id);
        }
      }
    }

    return () => {};
  }, [selectedActivities]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of pinTimers.current.values()) clearTimeout(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    const list = places.filter((p) => {
      if (showSelected && !selectedIds.has(p.id)) return false;
      if (cityFilter !== 'all' && p.city !== cityFilter) return false;
      if (categoryFilter !== 'all' && !p.types?.some((t) => t.includes(categoryFilter))) return false;
      if (ratingFilter > 0 && (p.rating || 0) < ratingFilter) return false;
      if (priceFilter >= 0 && p.priceLevel != null && p.priceLevel !== priceFilter) return false;
      if (showInstagram && p.source !== 'instagram') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = p.name?.toLowerCase().includes(q);
        const addrMatch = p.address?.toLowerCase().includes(q);
        if (!nameMatch && !addrMatch) return false;
      }
      return true;
    });

    // Sort: pinned selected items first, then the rest
    const pinned = list.filter((p) => pinnedIds.has(p.id));
    const rest = list.filter((p) => !pinnedIds.has(p.id));
    return [...pinned, ...rest];
  }, [places, categoryFilter, ratingFilter, priceFilter, cityFilter, showSelected, showInstagram, selectedIds, searchQuery, pinnedIds]);

  const cityNames = tripConfig.cities.map((c) => c.name);

  async function handleCustomSearch(e) {
    e.preventDefault();
    if (!customSearch.trim()) return;
    setSearching(true);
    try {
      const results = await Promise.all(
        tripConfig.cities.map((city) =>
          api.searchPlaces(city.name, customSearch).then((places) =>
            places.map((p) => ({ ...p, city: city.name }))
          )
        )
      );
      const newPlaces = results.flat();
      setPlaces((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const unique = newPlaces.filter((p) => !seen.has(p.id));
        return [...unique, ...prev];
      });
      setSearchQuery(customSearch);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    setImportResults(null);
    setImportProgress(null);
    setAddedImports(new Set());
    const cities = tripConfig.cities.map((c) => c.name);

    try {
      if (importMode === 'url') {
        // Support multiple URLs — one per line
        const urls = importInput
          .split('\n')
          .map((u) => u.trim())
          .filter((u) => u && u.includes('instagram.com'));

        if (!urls.length) {
          setImportError('No valid Instagram URLs found. Paste one URL per line.');
          setImporting(false);
          return;
        }

        const allActivities = [];
        const errors = [];
        setImportProgress({ current: 0, total: urls.length });

        for (let i = 0; i < urls.length; i++) {
          setImportProgress({ current: i + 1, total: urls.length });
          try {
            const result = await api.extractInstagramUrl(urls[i], cities);
            if (result.activities?.length) {
              allActivities.push(...result.activities);
            }
          } catch (err) {
            errors.push(`URL ${i + 1}: ${err.message}`);
          }
        }

        if (allActivities.length) {
          // Deduplicate by name
          const seen = new Set();
          const unique = allActivities.filter((a) => {
            const key = a.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setImportResults(unique);
        }
        if (!allActivities.length) {
          setImportError(errors.length
            ? `No places found. Errors: ${errors.join('; ')}`
            : 'No places found in any of the URLs.');
        } else if (errors.length) {
          setImportError(`Found ${allActivities.length} places. ${errors.length} URL(s) failed.`);
        }
      } else {
        // Single text block — send as one request
        const result = await api.extractActivities(importInput, cities);
        if (result.activities?.length) {
          setImportResults(result.activities);
        } else {
          setImportError(result.message || 'No activities found. Try pasting more detailed content.');
        }
      }
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  const addingRef = useRef(new Set());

  async function addImportedActivity(activity) {
    // Prevent duplicate adds from rapid clicks
    const key = activity.name.toLowerCase();
    if (addingRef.current.has(key)) return;
    addingRef.current.add(key);

    try {
      const city = activity.city || tripConfig.cities[0]?.name;
      const results = await api.searchPlaces(city, activity.name);
      if (results.length > 0) {
        const place = { ...results[0], city, source: 'instagram' };
        setPlaces((prev) => {
          const existing = prev.find((p) => p.id === place.id);
          if (existing) {
            // Tag existing place as instagram, don't duplicate
            return prev.map((p) => p.id === place.id ? { ...p, source: 'instagram' } : p);
          }
          // Check no duplicate by id
          if (prev.some((p) => p.id === place.id)) return prev;
          return [place, ...prev];
        });
        // Select if not already
        if (!selectedIds.has(place.id)) onToggle({ ...results[0], city, source: 'instagram' });
      } else {
        // Add as custom activity without Google data
        const custom = {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: activity.name,
          city: activity.city || tripConfig.cities[0]?.name,
          types: [activity.category || 'activity'],
          rating: null,
          priceLevel: null,
          address: '',
          photo: null,
          source: 'instagram',
          description: activity.description,
        };
        setPlaces((prev) => [custom, ...prev]);
        onToggle(custom);
      }
    } catch {
      // Silently fail individual adds
    } finally {
      addingRef.current.delete(key);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pick your activities</h2>
          <p className="text-sm text-gray-400 mt-0.5">{selectedActivities.length} selected</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={!selectedActivities.length || loading}
          className="px-5 py-2.5 bg-[#007AFF] text-white font-semibold rounded-xl text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {loading ? 'Generating…' : 'Generate Itinerary →'}
        </button>
      </div>

      {/* Search bar */}
      <form onSubmit={handleCustomSearch} className="flex gap-2">
        <input
          type="text"
          value={customSearch}
          onChange={(e) => {
            setCustomSearch(e.target.value);
            if (!e.target.value) setSearchQuery('');
          }}
          placeholder="Search for places, restaurants, activities..."
          className="flex-1 px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
        />
        <button
          type="submit"
          disabled={searching || !customSearch.trim()}
          className="px-4 py-2.5 bg-[#007AFF] text-white rounded-2xl text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {searching ? '…' : 'Search'}
        </button>
        <button
          type="button"
          onClick={() => setShowImport(!showImport)}
          className={`px-3 py-2.5 rounded-2xl border-2 text-sm font-medium transition-all ${
            showImport
              ? 'border-[#007AFF] bg-[#007AFF]/5 text-[#007AFF]'
              : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
          }`}
          title="Import from Instagram"
        >
          <span className="text-base">📷</span>
        </button>
      </form>

      {/* Instagram import panel */}
      {showImport && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Import from Instagram</p>
            <div className="flex gap-1">
              <button
                onClick={() => setImportMode('text')}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  importMode === 'text' ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Paste caption
              </button>
              <button
                onClick={() => setImportMode('url')}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  importMode === 'url' ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Paste URL
              </button>
            </div>
          </div>

          {importMode === 'text' ? (
            <textarea
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
              placeholder="Paste Instagram reel caption, travel blog text, or any content with place recommendations..."
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] resize-none"
            />
          ) : (
            <textarea
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
              placeholder={"Paste Instagram URLs — one per line:\nhttps://www.instagram.com/reel/...\nhttps://www.instagram.com/reel/...\nhttps://www.instagram.com/reel/..."}
              rows={5}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] resize-none font-mono"
            />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              disabled={importing || !importInput.trim()}
              className="px-4 py-2 bg-[#007AFF] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {importing && importProgress
                ? `Processing ${importProgress.current}/${importProgress.total}…`
                : importing ? 'Extracting…' : 'Extract Activities'}
            </button>
            <p className="text-xs text-gray-400">
              {importMode === 'url'
                ? 'Paste multiple URLs (one per line) to bulk import'
                : 'Claude will identify places and activities from the text'
              }
            </p>
          </div>
          {importing && importProgress && (
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-[#007AFF] h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
          )}

          {importError && (
            <p className="text-xs text-red-500">{importError}</p>
          )}

          {importResults && importResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 font-medium">
                  Found {importResults.length} places — tap to add:
                </p>
                {importResults.length > 1 && addedImports.size < importResults.length && (
                  <button
                    onClick={() => {
                      importResults.forEach((a) => {
                        if (!addedImports.has(a.name)) addImportedActivity(a);
                      });
                      setAddedImports(new Set(importResults.map((a) => a.name)));
                    }}
                    className="text-xs text-[#007AFF] font-medium hover:underline"
                  >
                    Add all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {importResults.map((activity, idx) => {
                  const isAdded = addedImports.has(activity.name);
                  return (
                    <button
                      key={idx}
                      disabled={isAdded}
                      onClick={() => {
                        addImportedActivity(activity);
                        setAddedImports((prev) => new Set([...prev, activity.name]));
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-left ${
                        isAdded
                          ? 'bg-green-50 border-green-200 opacity-70 cursor-default'
                          : 'bg-gray-50 border-gray-200 hover:border-[#007AFF] hover:bg-[#007AFF]/5'
                      }`}
                    >
                      <span className="text-sm">{isAdded ? '✓' : '+'}</span>
                      <div>
                        <p className={`text-sm font-medium ${isAdded ? 'text-green-700' : 'text-gray-900'}`}>{activity.name}</p>
                        <p className="text-xs text-gray-400">
                          {activity.city}{activity.category ? ` · ${activity.category}` : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setCategoryFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                categoryFilter === f.key
                  ? 'bg-[#007AFF] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* City filter (multi-city only) */}
          {cityNames.length > 1 && (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
            >
              <option value="all">All cities</option>
              {cityNames.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {/* Rating filter */}
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(Number(e.target.value))}
            className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
          >
            {RATING_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>

          {/* Price filter */}
          <select
            value={priceFilter}
            onChange={(e) => setPriceFilter(Number(e.target.value))}
            className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
          >
            {PRICE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>

          {/* Show selected toggle */}
          <button
            onClick={() => setShowSelected(!showSelected)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              showSelected
                ? 'bg-[#007AFF] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Selected only
          </button>

          {/* Instagram filter */}
          {places.some((p) => p.source === 'instagram') && (
            <button
              onClick={() => setShowInstagram(!showInstagram)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                showInstagram
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📷 IG Reels
            </button>
          )}

          {/* Result count */}
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} results</span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {fetching ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No activities match your filters.
        </div>
      ) : (
        <>
          {/* Pinned selected section */}
          {(() => {
            const pinnedItems = filtered.filter((p) => pinnedIds.has(p.id));
            const unpinnedItems = filtered.filter((p) => !pinnedIds.has(p.id));
            return (
              <>
                {pinnedItems.length > 0 && !showSelected && (
                  <section>
                    <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">
                      Your Picks
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {pinnedItems.map((place) => (
                        <ActivityCard
                          key={place.id}
                          place={place}
                          selected={selectedIds.has(place.id)}
                          onToggle={() => onToggle(place)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">
                    {showSelected ? 'Selected Activities' : searchQuery ? `Results for "${searchQuery}"` : 'Most Popular'}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(showSelected ? filtered : unpinnedItems).slice(0, 10).map((place) => (
                      <ActivityCard
                        key={place.id}
                        place={place}
                        selected={selectedIds.has(place.id)}
                        onToggle={() => onToggle(place)}
                      />
                    ))}
                  </div>
                </section>

                {(showSelected ? filtered : unpinnedItems).length > 10 && (
                  <section>
                    <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">More to Explore</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {(showSelected ? filtered : unpinnedItems).slice(10).map((place) => (
                        <ActivityCard
                          key={place.id}
                          place={place}
                          selected={selectedIds.has(place.id)}
                          onToggle={() => onToggle(place)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
