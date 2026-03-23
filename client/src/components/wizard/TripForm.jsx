import { useState } from 'react';
import PlaceAutocomplete from '../ui/PlaceAutocomplete';
import ScrollDatePicker from '../ui/ScrollDatePicker';

const INTERESTS = [
  { label: 'Food & Drink', icon: '🍽️' },
  { label: 'Museums', icon: '🏛️' },
  { label: 'Nature', icon: '🌿' },
  { label: 'Nightlife', icon: '🌙' },
  { label: 'Shopping', icon: '🛍️' },
  { label: 'Architecture', icon: '🏗️' },
  { label: 'Family-friendly', icon: '👨‍👩‍👧' },
  { label: 'Hidden Gems', icon: '💎' },
];

const LOCAL_TRANSPORT = [
  { label: 'Walk', icon: '🚶' },
  { label: 'Subway / Transit', icon: '🚇' },
  { label: 'Taxi / Rideshare', icon: '🚕' },
  { label: 'Rental Car', icon: '🚗' },
];

const INTERCITY_TRANSPORT = [
  { label: 'Flight', icon: '✈️' },
  { label: 'Train', icon: '🚄' },
  { label: 'Bus', icon: '🚌' },
  { label: 'Car', icon: '🚗' },
  { label: 'Ferry', icon: '⛴️' },
];

const WIZARD_STEPS = ['cities', 'dates', 'transport', 'interests', 'budget'];

function StepShell({ title, subtitle, onBack, children, progress }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Progress bar */}
      <div className="w-full max-w-md mb-8">
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#007AFF] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="w-full max-w-md">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-6 text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
          >
            ← Back
          </button>
        )}
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-gray-400 mt-1 text-sm">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export default function TripForm({ onSubmit, initialValues, submitLabel }) {
  const emptyCity = { name: '', stay: '', arrival: '', departure: '', cityPlaceId: null, stayPlaceId: null, stayLocation: null };

  const [wizardStep, setWizardStep] = useState(0);
  const [cities, setCities] = useState(initialValues?.cities?.length ? initialValues.cities : [{ ...emptyCity }]);
  const [interests, setInterests] = useState(initialValues?.interests ?? []);
  // Per-leg intercity transport: array of transport labels, one per leg (city pair)
  const [legTransport, setLegTransport] = useState(initialValues?.legTransport ?? []);
  const [localTransport, setLocalTransport] = useState(initialValues?.localTransport ?? '');
  const [busDetails, setBusDetails] = useState(initialValues?.busDetails ?? []);
  const [groupSize, setGroupSize] = useState(initialValues?.groupSize ?? 2);
  const [budget, setBudget] = useState(initialValues?.budget ?? 'mid-range');
  // Which city's date picker is open (index), null = none
  const [editingDateCity, setEditingDateCity] = useState(null);
  // Which date field is being edited: 'arrival' or 'departure'
  const [editingDateField, setEditingDateField] = useState('arrival');

  function updateCity(index, field, value) {
    setCities((prev) => {
      const updated = prev.map((c, i) => (i === index ? { ...c, [field]: value } : c));
      const city = updated[index];

      if (field === 'arrival' && value) {
        // Default departure to arrival date if departure is empty or before arrival
        if (!city.departure || city.departure < value) {
          updated[index] = { ...city, departure: value };
        }
      }

      if (field === 'departure' && value) {
        // Prevent departure before arrival
        if (city.arrival && value < city.arrival) {
          updated[index] = { ...updated[index], departure: city.arrival };
          value = city.arrival;
        }
        // Auto-cascade: set next city's arrival (and default its departure) to this departure
        if (index < updated.length - 1) {
          const next = updated[index + 1];
          if (!next.arrival || next.arrival === prev[index].departure) {
            const cascaded = { ...next, arrival: value };
            // Also default next city's departure if empty or before the new arrival
            if (!cascaded.departure || cascaded.departure < value) {
              cascaded.departure = value;
            }
            updated[index + 1] = cascaded;
          }
        }
      }

      return updated;
    });
  }

  function addCity() {
    setCities((prev) => [...prev, { ...emptyCity }]);
  }

  function removeCity(index) {
    setCities((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleInterest(label) {
    setInterests((prev) => prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]);
  }

  function setLegTransportAt(legIndex, value) {
    setLegTransport((prev) => {
      const updated = [...prev];
      updated[legIndex] = value;
      return updated;
    });
  }

  function next() {
    if (wizardStep < WIZARD_STEPS.length - 1) setWizardStep((s) => s + 1);
  }

  function back() {
    if (wizardStep > 0) setWizardStep((s) => s - 1);
  }

  function handleSubmit() {
    const valid = cities.every((c) => c.name && c.arrival && c.departure);
    if (!valid) return;
    // Flatten legTransport to a single transport value for backward compat
    const transport = legTransport.length > 0 ? legTransport[0] : '';
    onSubmit({ cities, interests, transport, legTransport, localTransport, busDetails, groupSize, budget });
  }

  const progress = ((wizardStep + 1) / WIZARD_STEPS.length) * 100;
  const canContinue = (() => {
    switch (WIZARD_STEPS[wizardStep]) {
      case 'cities': return cities.every((c) => c.name);
      case 'dates': return cities.every((c) => c.arrival && c.departure);
      case 'transport': return !!localTransport;
      case 'interests': return interests.length > 0;
      case 'budget': return true;
      default: return true;
    }
  })();

  const currentStep = WIZARD_STEPS[wizardStep];

  function formatDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ─── Step: Cities ───
  if (currentStep === 'cities') {
    return (
      <StepShell
        title="Where are you going?"
        subtitle="Add the cities you'll visit"
        progress={progress}
      >
        <div className="space-y-3">
          {cities.map((city, i) => (
            <div key={i} className="relative">
              <PlaceAutocomplete
                endpoint="/api/places/autocomplete/city"
                value={city.name}
                onChange={(text) => updateCity(i, 'name', text)}
                onSelect={(s) => {
                  updateCity(i, 'name', s.mainText);
                  updateCity(i, 'cityPlaceId', s.placeId);
                }}
                placeholder={i === 0 ? 'First city (e.g. Hanoi)' : 'Next city'}
                className="!py-3 !text-base !rounded-2xl"
              />
              {cities.length > 1 && (
                <button
                  onClick={() => removeCity(i)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-400 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addCity}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-[#007AFF] hover:text-[#007AFF] transition-colors"
          >
            + Add another city
          </button>
        </div>
        <button
          onClick={next}
          disabled={!canContinue}
          className="w-full mt-6 py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 disabled:opacity-30 transition-opacity text-base"
        >
          {submitLabel || 'Continue'}
        </button>
      </StepShell>
    );
  }

  // ─── Step: Dates + Stay ───
  if (currentStep === 'dates') {
    return (
      <StepShell
        title="When and where are you staying?"
        subtitle="Tap a date to change it"
        onBack={back}
        progress={progress}
      >
        <div className="space-y-4">
          {cities.map((city, i) => (
            <div key={i} className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <p className="font-medium text-gray-900">{city.name}</p>
              <PlaceAutocomplete
                endpoint="/api/places/autocomplete/address"
                extraParams={city.name ? { city: city.name } : {}}
                value={city.stay}
                onChange={(text) => updateCity(i, 'stay', text)}
                onSelect={async (s) => {
                  updateCity(i, 'stay', s.description);
                  updateCity(i, 'stayPlaceId', s.placeId);
                  try {
                    const res = await fetch(`/api/places/details?place_id=${s.placeId}`);
                    const data = await res.json();
                    if (data.location) updateCity(i, 'stayLocation', data.location);
                  } catch {}
                }}
                placeholder="Hotel, Airbnb, or address"
                className="!py-3 !rounded-2xl"
              />

              {/* Date buttons that open scroll picker */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setEditingDateCity(i); setEditingDateField('arrival'); }}
                  className={`w-full px-3 py-3 rounded-2xl border text-left text-sm transition-all ${
                    editingDateCity === i && editingDateField === 'arrival'
                      ? 'border-[#007AFF] bg-[#007AFF]/5 ring-2 ring-[#007AFF]/20'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <span className="text-xs text-gray-400 block mb-0.5">Arrival</span>
                  <span className={city.arrival ? 'text-gray-900 font-medium' : 'text-gray-300'}>
                    {formatDate(city.arrival) || 'Select date'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!city.arrival}
                  onClick={() => { if (city.arrival) { setEditingDateCity(i); setEditingDateField('departure'); } }}
                  className={`w-full px-3 py-3 rounded-2xl border text-left text-sm transition-all ${
                    !city.arrival
                      ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                      : editingDateCity === i && editingDateField === 'departure'
                        ? 'border-[#007AFF] bg-[#007AFF]/5 ring-2 ring-[#007AFF]/20'
                        : 'border-gray-200 bg-white'
                  }`}
                >
                  <span className="text-xs text-gray-400 block mb-0.5">Departure</span>
                  <span className={city.departure ? 'text-gray-900 font-medium' : 'text-gray-300'}>
                    {!city.arrival ? 'Set arrival first' : formatDate(city.departure) || 'Select date'}
                  </span>
                </button>
              </div>

              {/* Scroll wheel picker — shown inline when editing this city's date */}
              {editingDateCity === i && (
                <div className="animate-in slide-in-from-bottom-2 duration-200">
                  <ScrollDatePicker
                    label={editingDateField === 'arrival' ? 'Arrival date' : 'Departure date'}
                    value={city[editingDateField]}
                    onChange={(dateStr) => {
                      updateCity(i, editingDateField, dateStr);
                    }}
                  />
                  <button
                    onClick={() => setEditingDateCity(null)}
                    className="w-full mt-2 py-2 text-sm text-[#007AFF] font-medium"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={next}
          disabled={!canContinue}
          className="w-full mt-6 py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 disabled:opacity-30 transition-opacity text-base"
        >
          {submitLabel || 'Continue'}
        </button>
      </StepShell>
    );
  }

  // ─── Step: Transport ───
  if (currentStep === 'transport') {
    return (
      <StepShell
        title="How will you get around?"
        onBack={back}
        progress={progress}
      >
        {/* Per-leg intercity transport */}
        {cities.length > 1 && (
          <div className="mb-6 space-y-4">
            <p className="text-sm text-gray-500 mb-1">Between cities</p>
            {cities.slice(0, -1).map((city, legIdx) => {
              const nextCity = cities[legIdx + 1];
              const selected = legTransport[legIdx] || '';
              return (
                <div key={legIdx} className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    {city.name} → {nextCity.name}
                    {city.departure && (
                      <span className="text-xs text-gray-400 ml-2">{formatDate(city.departure)}</span>
                    )}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {INTERCITY_TRANSPORT.map((t) => (
                      <button
                        key={t.label}
                        onClick={() => setLegTransportAt(legIdx, t.label)}
                        className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 text-xs font-medium transition-all ${
                          selected === t.label
                            ? 'border-[#007AFF] bg-[#007AFF]/5 text-[#007AFF]'
                            : 'border-gray-100 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-lg">{t.icon}</span>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Transport details for this leg */}
                  {selected && (
                    <div className="mt-3 space-y-2">
                      {selected === 'Bus' && (
                        <input
                          type="text"
                          placeholder="Operator / route (e.g. The Sinh Tourist)"
                          value={(busDetails[legIdx] || {}).operator || ''}
                          onChange={(e) => {
                            const updated = [...busDetails];
                            updated[legIdx] = { ...(updated[legIdx] || {}), operator: e.target.value };
                            setBusDetails(updated);
                          }}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
                        />
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Departure time</label>
                          <input
                            type="time"
                            value={(busDetails[legIdx] || {}).departureTime || ''}
                            onChange={(e) => {
                              const updated = [...busDetails];
                              updated[legIdx] = { ...(updated[legIdx] || {}), departureTime: e.target.value };
                              setBusDetails(updated);
                            }}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Arrival time</label>
                          <input
                            type="time"
                            value={(busDetails[legIdx] || {}).arrivalTime || ''}
                            onChange={(e) => {
                              const updated = [...busDetails];
                              updated[legIdx] = { ...(updated[legIdx] || {}), arrivalTime: e.target.value };
                              setBusDetails(updated);
                            }}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
                          />
                        </div>
                      </div>
                      {selected === 'Bus' && (
                        <input
                          type="text"
                          placeholder="Booking ref (optional)"
                          value={(busDetails[legIdx] || {}).bookingRef || ''}
                          onChange={(e) => {
                            const updated = [...busDetails];
                            updated[legIdx] = { ...(updated[legIdx] || {}), bookingRef: e.target.value };
                            setBusDetails(updated);
                          }}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div>
          <p className="text-sm text-gray-500 mb-3">Within the city</p>
          <div className="grid grid-cols-2 gap-2">
            {LOCAL_TRANSPORT.map((t) => (
              <button
                key={t.label}
                onClick={() => setLocalTransport(t.label)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left text-sm font-medium transition-all ${
                  localTransport === t.label
                    ? 'border-[#007AFF] bg-[#007AFF]/5 text-[#007AFF]'
                    : 'border-gray-100 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="text-lg">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={next}
          disabled={!canContinue}
          className="w-full mt-6 py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 disabled:opacity-30 transition-opacity text-base"
        >
          {submitLabel || 'Continue'}
        </button>
      </StepShell>
    );
  }

  // ─── Step: Interests ───
  if (currentStep === 'interests') {
    return (
      <StepShell
        title="What are you into?"
        subtitle="Pick as many as you like"
        onBack={back}
        progress={progress}
      >
        <div className="grid grid-cols-2 gap-2">
          {INTERESTS.map((interest) => (
            <button
              key={interest.label}
              onClick={() => toggleInterest(interest.label)}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left text-sm font-medium transition-all ${
                interests.includes(interest.label)
                  ? 'border-[#007AFF] bg-[#007AFF]/5 text-[#007AFF]'
                  : 'border-gray-100 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="text-lg">{interest.icon}</span>
              {interest.label}
            </button>
          ))}
        </div>
        <button
          onClick={next}
          disabled={!canContinue}
          className="w-full mt-6 py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 disabled:opacity-30 transition-opacity text-base"
        >
          {submitLabel || 'Continue'}
        </button>
      </StepShell>
    );
  }

  // ─── Step: Budget + Group ───
  if (currentStep === 'budget') {
    const budgetOptions = [
      { value: 'budget', label: 'Budget', desc: 'Hostels, street food, free activities', icon: '🎒' },
      { value: 'mid-range', label: 'Mid-range', desc: 'Hotels, restaurants, popular spots', icon: '🏨' },
      { value: 'luxury', label: 'Luxury', desc: 'Premium stays, fine dining, VIP access', icon: '✨' },
    ];

    return (
      <StepShell
        title="Last details"
        onBack={back}
        progress={progress}
      >
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-500 mb-3">Budget level</p>
            <div className="space-y-2">
              {budgetOptions.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setBudget(b.value)}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl border-2 text-left transition-all ${
                    budget === b.value
                      ? 'border-[#007AFF] bg-[#007AFF]/5'
                      : 'border-gray-100 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl">{b.icon}</span>
                  <div>
                    <p className={`font-medium text-sm ${budget === b.value ? 'text-[#007AFF]' : 'text-gray-900'}`}>{b.label}</p>
                    <p className="text-xs text-gray-400">{b.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-500 mb-3">Group size</p>
            <div className="flex items-center gap-4 bg-white border-2 border-gray-100 rounded-2xl px-4 py-3">
              <button
                onClick={() => setGroupSize((g) => Math.max(1, g - 1))}
                className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 font-semibold text-lg hover:bg-gray-200 transition-colors"
              >
                −
              </button>
              <span className="flex-1 text-center text-2xl font-semibold text-gray-900">{groupSize}</span>
              <button
                onClick={() => setGroupSize((g) => Math.min(20, g + 1))}
                className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 font-semibold text-lg hover:bg-gray-200 transition-colors"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          className="w-full mt-6 py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity text-base"
        >
          Find Activities →
        </button>
      </StepShell>
    );
  }

  return null;
}
