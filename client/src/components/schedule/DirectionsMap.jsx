import { useState, useEffect, useRef, useCallback } from 'react';
import { WalkIcon, TrainIcon, CarIcon } from '../ui/Icons';

const SNAP_COLLAPSED = 80;
const SNAP_HALF_VH = 40;
const SNAP_EXPANDED_VH = 75;

function getSnapPx() {
  const vh = window.innerHeight;
  return {
    collapsed: SNAP_COLLAPSED,
    half: vh * (SNAP_HALF_VH / 100),
    expanded: vh * (SNAP_EXPANDED_VH / 100),
  };
}

function travelModeIcon(mode) {
  if (mode === 'WALKING') return <WalkIcon />;
  if (mode === 'TRANSIT') return <TrainIcon />;
  return <CarIcon />;
}

export default function DirectionsMap({ itinerary, tripConfig, onClose }) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [mapsReady, setMapsReady] = useState(!!window.google?.maps);
  const [routeLegs, setRouteLegs] = useState([]);
  const [drawerHeight, setDrawerHeight] = useState(SNAP_COLLAPSED);
  const [isDragging, setIsDragging] = useState(false);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const directionsRenderer = useRef(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const day = itinerary.days[selectedDay];
  const items = day?.items ?? [];
  const cities = [...new Set(itinerary.days.map((d) => d.city).filter(Boolean))];

  const travelMode = tripConfig?.localTransport === 'Walk' ? 'WALKING'
    : tripConfig?.localTransport === 'Subway / Transit' ? 'TRANSIT'
    : 'DRIVING';

  // Total route summary
  const totalDistance = routeLegs.reduce((s, l) => s + (l.distanceValue || 0), 0);
  const totalDuration = routeLegs.reduce((s, l) => s + (l.durationValue || 0), 0);
  const totalDistanceText = totalDistance >= 1000
    ? `${(totalDistance / 1000).toFixed(1)}km`
    : `${totalDistance}m`;
  const totalDurationText = totalDuration >= 3600
    ? `${Math.floor(totalDuration / 3600)}h ${Math.round((totalDuration % 3600) / 60)}min`
    : `${Math.round(totalDuration / 60)}min`;

  // ─── Load Google Maps script ───
  useEffect(() => {
    if (window.google?.maps) { setMapsReady(true); return; }
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) { existing.addEventListener('load', () => setMapsReady(true)); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.onload = () => setMapsReady(true);
    document.head.appendChild(script);
  }, []);

  // ─── Map + Directions ───
  useEffect(() => {
    if (!mapsReady || !window.google || !mapRef.current) return;
    let cancelled = false;

    if (!mapInstance.current) {
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        zoom: 13,
        center: { lat: 0, lng: 0 },
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });
      directionsRenderer.current = new window.google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: { strokeColor: '#007AFF', strokeWeight: 4, strokeOpacity: 0.8 },
      });
      directionsRenderer.current.setMap(mapInstance.current);
    }

    setRouteLegs([]);

    if (items.length === 0) {
      directionsRenderer.current.set('directions', null);
      return;
    }

    if (items.length === 1) {
      directionsRenderer.current.set('directions', null);
      mapInstance.current.setCenter({ lat: items[0].lat, lng: items[0].lng });
      mapInstance.current.setZoom(15);
      return;
    }

    const origin = { lat: items[0].lat, lng: items[0].lng };
    const destination = { lat: items[items.length - 1].lat, lng: items[items.length - 1].lng };
    const waypoints = items.slice(1, -1).map((it) => ({
      location: { lat: it.lat, lng: it.lng },
      stopover: true,
    }));

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      { origin, destination, waypoints, travelMode: window.google.maps.TravelMode[travelMode] },
      (result, status) => {
        if (cancelled) return;
        if (status === 'OK') {
          directionsRenderer.current.setDirections(result);
          // Extract leg data
          const legs = result.routes[0]?.legs || [];
          setRouteLegs(legs.map((leg) => ({
            duration: leg.duration?.text || '',
            durationValue: leg.duration?.value || 0,
            distance: leg.distance?.text || '',
            distanceValue: leg.distance?.value || 0,
          })));
        } else {
          console.warn('Directions failed:', status);
          mapInstance.current.setCenter(origin);
          directionsRenderer.current.set('directions', null);
        }
      }
    );

    return () => { cancelled = true; };
  }, [mapsReady, selectedDay, items, travelMode]);

  // ─── Drawer drag handlers ───
  const snapToNearest = useCallback((height) => {
    const snaps = getSnapPx();
    const points = [snaps.collapsed, snaps.half, snaps.expanded];
    let closest = points[0];
    let minDist = Math.abs(height - closest);
    for (const p of points) {
      const d = Math.abs(height - p);
      if (d < minDist) { minDist = d; closest = p; }
    }
    setDrawerHeight(closest);
  }, []);

  const handleDragStart = useCallback((clientY) => {
    setIsDragging(true);
    dragStartY.current = clientY;
    dragStartHeight.current = drawerHeight;
  }, [drawerHeight]);

  const handleDragMove = useCallback((clientY) => {
    if (!isDragging) return;
    const delta = dragStartY.current - clientY;
    const newHeight = Math.max(SNAP_COLLAPSED, Math.min(window.innerHeight * 0.85, dragStartHeight.current + delta));
    setDrawerHeight(newHeight);
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    snapToNearest(drawerHeight);
  }, [drawerHeight, snapToNearest]);

  // Mouse events
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => handleDragMove(e.clientY);
    const onUp = () => handleDragEnd();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Click activity → pan map
  function panToItem(item) {
    if (mapInstance.current && item.lat && item.lng) {
      mapInstance.current.panTo({ lat: item.lat, lng: item.lng });
      mapInstance.current.setZoom(16);
    }
  }

  // Expand drawer on first interaction
  function expandIfCollapsed() {
    if (drawerHeight <= SNAP_COLLAPSED + 10) {
      setDrawerHeight(getSnapPx().half);
    }
  }

  // Prevent body scroll when overlay is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const isCollapsed = drawerHeight <= SNAP_COLLAPSED + 10;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900">
      {/* ─── Floating top bar ─── */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="bg-white/90 backdrop-blur-md border-b border-gray-200/50">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span className="text-lg">←</span>
              <span className="font-medium">Back</span>
            </button>
            <h3 className="text-sm font-semibold text-gray-900">Directions</h3>
            <div className="w-16" /> {/* spacer */}
          </div>

          {/* Day/City selector */}
          <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {cities.length > 1 && cities.map((city) => (
              <button
                key={city}
                onClick={() => {
                  const idx = itinerary.days.findIndex((d) => d.city === city);
                  if (idx !== -1) setSelectedDay(idx);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                  day?.city === city
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {city}
              </button>
            ))}

            {cities.length > 1 && (
              <div className="w-px h-5 bg-gray-200 flex-shrink-0 mx-1" />
            )}

            {itinerary.days.map((d, i) => (
              <button
                key={i}
                onClick={() => setSelectedDay(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  selectedDay === i
                    ? 'bg-[#007AFF] text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                Day {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Map (full screen) ─── */}
      <div className="absolute inset-0">
        {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
            Set VITE_GOOGLE_MAPS_API_KEY to enable maps
          </div>
        ) : (
          <>
            {!mapsReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400 text-sm z-10">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-gray-300 border-t-[#007AFF] rounded-full animate-spin" />
                  <span>Loading maps…</span>
                </div>
              </div>
            )}
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          </>
        )}
      </div>

      {/* ─── Bottom drawer ─── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-3xl shadow-2xl"
        style={{
          height: `${drawerHeight}px`,
          transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
      >
        {/* Drag handle */}
        <div
          className="flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={(e) => handleDragStart(e.clientY)}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
          onTouchEnd={handleDragEnd}
          onClick={expandIfCollapsed}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Collapsed summary */}
        {isCollapsed ? (
          <div
            className="px-5 pb-3 cursor-pointer"
            onClick={() => setDrawerHeight(getSnapPx().half)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">
                  {items.length} {items.length === 1 ? 'stop' : 'stops'}
                </span>
                {routeLegs.length > 0 && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm text-gray-500">{totalDistanceText}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm text-gray-500">{totalDurationText} travel</span>
                  </>
                )}
              </div>
              <span className="text-xs text-[#007AFF] font-medium">Details ↑</span>
            </div>
          </div>
        ) : (
          /* Expanded activity list */
          <div className="px-5 pb-5 overflow-y-auto" style={{ height: `${drawerHeight - 44}px` }}>
            {/* Day header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-base font-semibold text-gray-900">
                  Day {selectedDay + 1}{day?.city ? ` · ${day.city}` : ''}
                </h4>
                {day?.date && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
              {routeLegs.length > 0 && (
                <div className="text-right">
                  <p className="text-xs text-gray-400">Total travel</p>
                  <p className="text-sm font-medium text-gray-700">{totalDistanceText} · {totalDurationText}</p>
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                No activities scheduled for this day
              </div>
            ) : (
              <div className="space-y-0">
                {items.map((item, i) => (
                  <div key={item.place_id || i}>
                    {/* Activity stop */}
                    <button
                      onClick={() => panToItem(item)}
                      className="w-full flex items-start gap-3 py-3 px-2 -mx-2 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                    >
                      <span className="w-7 h-7 rounded-full bg-[#007AFF] text-white text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                        {item.address && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{item.address}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {item.start_time && (
                          <p className="text-sm font-medium text-gray-700">{item.start_time}</p>
                        )}
                        {item.end_time && (
                          <p className="text-xs text-gray-400">{item.end_time}</p>
                        )}
                      </div>
                    </button>

                    {/* Travel segment between stops */}
                    {i < items.length - 1 && (
                      <div className="flex items-center gap-3 py-1.5 pl-2">
                        <div className="w-7 flex justify-center">
                          <div className="w-0.5 h-8 bg-gray-200 relative">
                            <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 text-xs">
                              {travelModeIcon(travelMode)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {routeLegs[i] ? (
                            <>
                              <span className="text-xs font-medium text-gray-500">
                                {routeLegs[i].duration}
                              </span>
                              <span className="text-gray-300 text-xs">·</span>
                              <span className="text-xs text-gray-400">
                                {routeLegs[i].distance}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-gray-300">Calculating…</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CSS for hiding scrollbar on day selector */}
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
}
