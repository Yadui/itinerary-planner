import { useState } from 'react';
import PlaceAutocomplete from '../ui/PlaceAutocomplete';
import ScrollDatePicker from '../ui/ScrollDatePicker';
import { WalkIcon, TrainIcon, TaxiIcon, CarIcon, PlaneIcon, BusIcon, FerryIcon } from '../ui/Icons';

const INTERESTS = [
  { label: 'Food & Drink', icon: '🍜' },
  { label: 'Museums', icon: '🏛️' },
  { label: 'Nature', icon: '🌿' },
  { label: 'Nightlife', icon: '🌙' },
  { label: 'Shopping', icon: '🛍️' },
  { label: 'Architecture', icon: '🏰' },
  { label: 'Family-friendly', icon: '👨‍👩‍👧' },
  { label: 'Hidden Gems', icon: '💎' },
];

const LOCAL_TRANSPORT = [
  { label: 'Walk', Icon: WalkIcon },
  { label: 'Subway / Transit', Icon: TrainIcon },
  { label: 'Taxi / Rideshare', Icon: TaxiIcon },
  { label: 'Rental Car', Icon: CarIcon },
];

const INTERCITY_TRANSPORT = [
  { label: 'Flight', Icon: PlaneIcon },
  { label: 'Train', Icon: TrainIcon },
  { label: 'Bus', Icon: BusIcon },
  { label: 'Car', Icon: CarIcon },
  { label: 'Ferry', Icon: FerryIcon },
];

const WIZARD_STEPS = ['cities', 'dates', 'transport', 'interests', 'budget'];

const BUDGET_OPTIONS = [
  { value: 'budget', label: 'Budget', desc: 'Hostels, street food, free activities', icon: '$' },
  { value: 'mid-range', label: 'Mid-range', desc: 'Hotels, restaurants, popular spots', icon: '$$' },
  { value: 'luxury', label: 'Luxury', desc: 'Premium stays, fine dining, VIP access', icon: '$$$' },
];

function StepShell({ title, subtitle, onBack, children, progress }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
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
          <button onClick={onBack} className="mb-6 text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
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

function SectionCard({ title, children, editing, onEdit, onDone, canEdit = true }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        {canEdit && (
          editing
            ? <button onClick={onDone} className="text-xs font-medium text-[#007AFF]">Done</button>
            : <button onClick={onEdit} className="text-xs font-medium text-gray-400 hover:text-[#007AFF]">Edit</button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isFilled(values) {
  if (!values) return false;
  const hasCities = values.cities?.length > 0 && values.cities.every((c) => c.name && c.arrival && c.departure);
  const hasTransport = !!values.localTransport;
  const hasInterests = values.interests?.length > 0;
  return hasCities && hasTransport && hasInterests;
}

// ─────────────────────────────────────────────
// FLAT VIEW (all details on one page)
// ─────────────────────────────────────────────
function TripDetailsFlatView({
  cities, setCities, interests, setInterests, legTransport, setLegTransport,
  localTransport, setLocalTransport, busDetails, setBusDetails,
  groupSize, setGroupSize, budget, setBudget,
  onSubmit, submitLabel, canEdit,
}) {
  const [editingSection, setEditingSection] = useState(null);
  const [editingDateCity, setEditingDateCity] = useState(null);
  const [editingDateField, setEditingDateField] = useState('arrival');

  const emptyCity = { name: '', stay: '', arrival: '', departure: '', cityPlaceId: null, stayPlaceId: null, stayLocation: null };

  function updateCity(index, field, value) {
    setCities((prev) => {
      const updated = prev.map((c, i) => (i === index ? { ...c, [field]: value } : c));
      const city = updated[index];
      if (field === 'arrival' && value && (!city.departure || city.departure < value)) {
        updated[index] = { ...city, arrival: value, departure: value };
      }
      if (field === 'departure' && value) {
        if (city.arrival && value < city.arrival) {
          updated[index] = { ...updated[index], departure: city.arrival };
        }
        if (index < updated.length - 1) {
          const next = updated[index + 1];
          if (!next.arrival || next.arrival === prev[index].departure) {
            const cascaded = { ...next, arrival: value };
            if (!cascaded.departure || cascaded.departure < value) cascaded.departure = value;
            updated[index + 1] = cascaded;
          }
        }
      }
      return updated;
    });
  }

  function setLegTransportAt(legIndex, value) {
    setLegTransport((prev) => {
      const updated = [...prev];
      updated[legIndex] = value;
      return updated;
    });
  }

  function handleSubmit() {
    const valid = cities.every((c) => c.name && c.arrival && c.departure);
    if (!valid) return;
    const transport = legTransport.length > 0 ? legTransport[0] : '';
    onSubmit?.({ cities, interests, transport, legTransport, localTransport, busDetails, groupSize, budget });
  }

  // Transport icons map
  const transportIcon = (label) => {
    const all = [...LOCAL_TRANSPORT, ...INTERCITY_TRANSPORT];
    const found = all.find((t) => t.label === label);
    return found ? <found.Icon className="text-base" /> : null;
  };

  const budgetInfo = BUDGET_OPTIONS.find((b) => b.value === budget) || BUDGET_OPTIONS[1];

  return (
    <div className="max-w-xl mx-auto space-y-3 pb-24">

      {/* ── Destinations ── */}
      <SectionCard
        title="Destinations"
        editing={editingSection === 'cities'}
        onEdit={() => setEditingSection('cities')}
        onDone={() => { setEditingSection(null); setEditingDateCity(null); }}
        canEdit={canEdit}
      >
        {editingSection === 'cities' ? (
          <div className="space-y-4">
            {cities.map((city, i) => (
              <div key={i} className="space-y-3">
                {/* City header with remove */}
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#007AFF]/10 text-[#007AFF] text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <PlaceAutocomplete
                      endpoint="/api/places/autocomplete/city"
                      value={city.name}
                      onChange={(text) => updateCity(i, 'name', text)}
                      onSelect={(s) => { updateCity(i, 'name', s.mainText); updateCity(i, 'cityPlaceId', s.placeId); }}
                      placeholder="City name"
                      className="!py-2 !text-sm !rounded-xl"
                    />
                  </div>
                  {cities.length > 1 && (
                    <button onClick={() => setCities((p) => p.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-400 text-sm">✕</button>
                  )}
                </div>

                {/* Stay */}
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
                  placeholder="Hotel / address (optional)"
                  className="!py-2 !text-sm !rounded-xl"
                />

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingDateCity(i); setEditingDateField('arrival'); }}
                    className={`px-3 py-2.5 rounded-xl border text-left text-sm transition-all ${
                      editingDateCity === i && editingDateField === 'arrival'
                        ? 'border-[#007AFF] bg-[#007AFF]/5'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <span className="text-xs text-gray-400 block">Arrival</span>
                    <span className={city.arrival ? 'text-gray-900 font-medium text-xs' : 'text-gray-300 text-xs'}>
                      {formatDate(city.arrival) || 'Select'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!city.arrival}
                    onClick={() => { if (city.arrival) { setEditingDateCity(i); setEditingDateField('departure'); } }}
                    className={`px-3 py-2.5 rounded-xl border text-left text-sm transition-all ${
                      !city.arrival ? 'border-gray-100 bg-gray-50 opacity-50' :
                      editingDateCity === i && editingDateField === 'departure'
                        ? 'border-[#007AFF] bg-[#007AFF]/5'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <span className="text-xs text-gray-400 block">Departure</span>
                    <span className={city.departure ? 'text-gray-900 font-medium text-xs' : 'text-gray-300 text-xs'}>
                      {formatDate(city.departure) || 'Select'}
                    </span>
                  </button>
                </div>

                {editingDateCity === i && (
                  <div>
                    <ScrollDatePicker
                      label={editingDateField === 'arrival' ? 'Arrival date' : 'Departure date'}
                      value={city[editingDateField]}
                      onChange={(dateStr) => updateCity(i, editingDateField, dateStr)}
                    />
                    <button onClick={() => setEditingDateCity(null)} className="w-full mt-2 py-1.5 text-sm text-[#007AFF] font-medium">Done</button>
                  </div>
                )}

                {/* Intercity transport to next city */}
                {i < cities.length - 1 && (
                  <div className="pt-1">
                    <p className="text-xs text-gray-400 mb-2">To {cities[i + 1]?.name || 'next city'}</p>
                    <div className="flex gap-2 flex-wrap">
                      {INTERCITY_TRANSPORT.map((t) => (
                        <button
                          key={t.label}
                          onClick={() => setLegTransportAt(i, t.label)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                            legTransport[i] === t.label
                              ? 'border-[#007AFF] bg-[#007AFF]/5 text-[#007AFF]'
                              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <t.Icon className="text-sm" /> {t.label}
                        </button>
                      ))}
                    </div>
                    {legTransport[i] && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Departs</label>
                          <input type="time" value={(busDetails[i] || {}).departureTime || ''}
                            onChange={(e) => { const u = [...busDetails]; u[i] = { ...(u[i] || {}), departureTime: e.target.value }; setBusDetails(u); }}
                            className="w-full px-2 py-1.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Arrives</label>
                          <input type="time" value={(busDetails[i] || {}).arrivalTime || ''}
                            onChange={(e) => { const u = [...busDetails]; u[i] = { ...(u[i] || {}), arrivalTime: e.target.value }; setBusDetails(u); }}
                            className="w-full px-2 py-1.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30" />
                        </div>
                        {legTransport[i] === 'Bus' && (
                          <>
                            <input type="text" placeholder="Operator / route" value={(busDetails[i] || {}).operator || ''}
                              onChange={(e) => { const u = [...busDetails]; u[i] = { ...(u[i] || {}), operator: e.target.value }; setBusDetails(u); }}
                              className="col-span-2 px-2 py-1.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30" />
                            <input type="text" placeholder="Booking ref" value={(busDetails[i] || {}).bookingRef || ''}
                              onChange={(e) => { const u = [...busDetails]; u[i] = { ...(u[i] || {}), bookingRef: e.target.value }; setBusDetails(u); }}
                              className="col-span-2 px-2 py-1.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30" />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {i < cities.length - 1 && <div className="border-b border-gray-100" />}
              </div>
            ))}
            <button
              onClick={() => setCities((p) => [...p, { ...emptyCity }])}
              className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#007AFF] hover:text-[#007AFF] transition-colors"
            >
              + Add city
            </button>
          </div>
        ) : (
          // Read-only cities view
          <div className="space-y-3">
            {cities.map((city, i) => (
              <div key={i}>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center pt-0.5">
                    <div className="w-7 h-7 rounded-full bg-[#007AFF]/10 text-[#007AFF] text-xs font-bold flex items-center justify-center">{i + 1}</div>
                    {i < cities.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1 mb-0 h-full min-h-[20px]" />}
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="font-semibold text-gray-900 text-sm">{city.name}</p>
                    {city.stay && <p className="text-xs text-gray-400 mt-0.5 truncate">{city.stay}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-lg">{formatDateShort(city.arrival)}</span>
                      <span className="text-xs text-gray-300">→</span>
                      <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-lg">{formatDateShort(city.departure)}</span>
                    </div>
                    {i < cities.length - 1 && legTransport[i] && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                        {transportIcon(legTransport[i])}
                        <span>{legTransport[i]} to {cities[i + 1]?.name}</span>
                        {busDetails[i]?.departureTime && <span>· {busDetails[i].departureTime}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Getting Around ── */}
      <SectionCard
        title="Getting Around"
        editing={editingSection === 'transport'}
        onEdit={() => setEditingSection('transport')}
        onDone={() => setEditingSection(null)}
        canEdit={canEdit}
      >
        {editingSection === 'transport' ? (
          <div className="grid grid-cols-2 gap-2">
            {LOCAL_TRANSPORT.map((t) => (
              <button
                key={t.label}
                onClick={() => setLocalTransport(t.label)}
                className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  localTransport === t.label
                    ? 'border-[#007AFF] bg-[#007AFF]/5 text-[#007AFF]'
                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300'
                }`}
              >
                <t.Icon className="text-base" /> {t.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {localTransport && transportIcon(localTransport)}
            <span className="text-sm text-gray-700">{localTransport || '—'}</span>
          </div>
        )}
      </SectionCard>

      {/* ── Interests ── */}
      <SectionCard
        title="Interests"
        editing={editingSection === 'interests'}
        onEdit={() => setEditingSection('interests')}
        onDone={() => setEditingSection(null)}
        canEdit={canEdit}
      >
        {editingSection === 'interests' ? (
          <div className="grid grid-cols-2 gap-2">
            {INTERESTS.map((interest) => (
              <button
                key={interest.label}
                onClick={() => setInterests((prev) => prev.includes(interest.label) ? prev.filter((x) => x !== interest.label) : [...prev, interest.label])}
                className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  interests.includes(interest.label)
                    ? 'border-[#007AFF] bg-[#007AFF]/5 text-[#007AFF]'
                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{interest.icon}</span> {interest.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {interests.length > 0
              ? interests.map((label) => {
                  const found = INTERESTS.find((i) => i.label === label);
                  return (
                    <span key={label} className="inline-flex items-center gap-1 text-xs bg-[#007AFF]/10 text-[#007AFF] px-2.5 py-1 rounded-full font-medium">
                      {found?.icon} {label}
                    </span>
                  );
                })
              : <span className="text-sm text-gray-400">None selected</span>
            }
          </div>
        )}
      </SectionCard>

      {/* ── Budget & Group ── */}
      <SectionCard
        title="Budget & Group"
        editing={editingSection === 'budget'}
        onEdit={() => setEditingSection('budget')}
        onDone={() => setEditingSection(null)}
        canEdit={canEdit}
      >
        {editingSection === 'budget' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {BUDGET_OPTIONS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setBudget(b.value)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all ${
                    budget === b.value ? 'border-[#007AFF] bg-[#007AFF]/5' : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg font-bold w-8 text-center">{b.icon}</span>
                  <div>
                    <p className={`font-medium text-sm ${budget === b.value ? 'text-[#007AFF]' : 'text-gray-900'}`}>{b.label}</p>
                    <p className="text-xs text-gray-400">{b.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Group size</p>
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                <button onClick={() => setGroupSize((g) => Math.max(1, g - 1))} className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50">−</button>
                <span className="flex-1 text-center text-lg font-semibold text-gray-900">{groupSize}</span>
                <button onClick={() => setGroupSize((g) => Math.min(20, g + 1))} className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50">+</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-gray-700">{budgetInfo.icon}</span>
              <span className="text-sm text-gray-700">{budgetInfo.label}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <span>👥</span>
              <span>{groupSize} {groupSize === 1 ? 'person' : 'people'}</span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Save button */}
      {onSubmit && (
        <button
          onClick={handleSubmit}
          className="w-full py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity text-base"
        >
          {submitLabel || 'Save Details'}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────
export default function TripForm({ onSubmit, initialValues, submitLabel }) {
  const emptyCity = { name: '', stay: '', arrival: '', departure: '', cityPlaceId: null, stayPlaceId: null, stayLocation: null };

  const [wizardStep, setWizardStep] = useState(0);
  const [cities, setCities] = useState(initialValues?.cities?.length ? initialValues.cities : [{ ...emptyCity }]);
  const [interests, setInterests] = useState(initialValues?.interests ?? []);
  const [legTransport, setLegTransport] = useState(initialValues?.legTransport ?? []);
  const [localTransport, setLocalTransport] = useState(initialValues?.localTransport ?? '');
  const [busDetails, setBusDetails] = useState(initialValues?.busDetails ?? []);
  const [groupSize, setGroupSize] = useState(initialValues?.groupSize ?? 2);
  const [budget, setBudget] = useState(initialValues?.budget ?? 'mid-range');
  const [editingDateCity, setEditingDateCity] = useState(null);
  const [editingDateField, setEditingDateField] = useState('arrival');

  // If trip already has complete details, show the flat view
  if (isFilled(initialValues)) {
    return (
      <TripDetailsFlatView
        cities={cities} setCities={setCities}
        interests={interests} setInterests={setInterests}
        legTransport={legTransport} setLegTransport={setLegTransport}
        localTransport={localTransport} setLocalTransport={setLocalTransport}
        busDetails={busDetails} setBusDetails={setBusDetails}
        groupSize={groupSize} setGroupSize={setGroupSize}
        budget={budget} setBudget={setBudget}
        onSubmit={onSubmit}
        submitLabel={submitLabel}
        canEdit={!!onSubmit}
      />
    );
  }

  // ─── Wizard flow (new trip) ───

  function updateCity(index, field, value) {
    setCities((prev) => {
      const updated = prev.map((c, i) => (i === index ? { ...c, [field]: value } : c));
      const city = updated[index];
      if (field === 'arrival' && value) {
        if (!city.departure || city.departure < value) updated[index] = { ...city, departure: value };
      }
      if (field === 'departure' && value) {
        if (city.arrival && value < city.arrival) {
          updated[index] = { ...updated[index], departure: city.arrival };
          value = city.arrival;
        }
        if (index < updated.length - 1) {
          const next = updated[index + 1];
          if (!next.arrival || next.arrival === prev[index].departure) {
            const cascaded = { ...next, arrival: value };
            if (!cascaded.departure || cascaded.departure < value) cascaded.departure = value;
            updated[index + 1] = cascaded;
          }
        }
      }
      return updated;
    });
  }

  function addCity() { setCities((prev) => [...prev, { ...emptyCity }]); }
  function removeCity(index) { setCities((prev) => prev.filter((_, i) => i !== index)); }
  function toggleInterest(label) { setInterests((prev) => prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]); }
  function setLegTransportAt(legIndex, value) { setLegTransport((prev) => { const u = [...prev]; u[legIndex] = value; return u; }); }
  function next() { if (wizardStep < WIZARD_STEPS.length - 1) setWizardStep((s) => s + 1); }
  function back() { if (wizardStep > 0) setWizardStep((s) => s - 1); }

  function handleSubmit() {
    const valid = cities.every((c) => c.name && c.arrival && c.departure);
    if (!valid) return;
    const transport = legTransport.length > 0 ? legTransport[0] : '';
    onSubmit?.({ cities, interests, transport, legTransport, localTransport, busDetails, groupSize, budget });
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

  // ─── Step: Cities ───
  if (currentStep === 'cities') {
    return (
      <StepShell title="Where are you going?" subtitle="Add the cities you'll visit" progress={progress}>
        <div className="space-y-3">
          {cities.map((city, i) => (
            <div key={i} className="relative">
              <PlaceAutocomplete
                endpoint="/api/places/autocomplete/city"
                value={city.name}
                onChange={(text) => updateCity(i, 'name', text)}
                onSelect={(s) => { updateCity(i, 'name', s.mainText); updateCity(i, 'cityPlaceId', s.placeId); }}
                placeholder={i === 0 ? 'First city (e.g. Hanoi)' : 'Next city'}
                className="!py-3 !text-base !rounded-2xl"
              />
              {cities.length > 1 && (
                <button onClick={() => removeCity(i)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-400 text-sm">✕</button>
              )}
            </div>
          ))}
          <button onClick={addCity} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-[#007AFF] hover:text-[#007AFF] transition-colors">
            + Add another city
          </button>
        </div>
        <button onClick={next} disabled={!canContinue} className="w-full mt-6 py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 disabled:opacity-30 transition-opacity text-base">
          {submitLabel || 'Continue'}
        </button>
      </StepShell>
    );
  }

  // ─── Step: Dates + Stay ───
  if (currentStep === 'dates') {
    return (
      <StepShell title="When and where are you staying?" subtitle="Tap a date to change it" onBack={back} progress={progress}>
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
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => { setEditingDateCity(i); setEditingDateField('arrival'); }}
                  className={`w-full px-3 py-3 rounded-2xl border text-left text-sm transition-all ${editingDateCity === i && editingDateField === 'arrival' ? 'border-[#007AFF] bg-[#007AFF]/5 ring-2 ring-[#007AFF]/20' : 'border-gray-200 bg-white'}`}>
                  <span className="text-xs text-gray-400 block mb-0.5">Arrival</span>
                  <span className={city.arrival ? 'text-gray-900 font-medium' : 'text-gray-300'}>{formatDate(city.arrival) || 'Select date'}</span>
                </button>
                <button type="button" disabled={!city.arrival}
                  onClick={() => { if (city.arrival) { setEditingDateCity(i); setEditingDateField('departure'); } }}
                  className={`w-full px-3 py-3 rounded-2xl border text-left text-sm transition-all ${!city.arrival ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed' : editingDateCity === i && editingDateField === 'departure' ? 'border-[#007AFF] bg-[#007AFF]/5 ring-2 ring-[#007AFF]/20' : 'border-gray-200 bg-white'}`}>
                  <span className="text-xs text-gray-400 block mb-0.5">Departure</span>
                  <span className={city.departure ? 'text-gray-900 font-medium' : 'text-gray-300'}>{!city.arrival ? 'Set arrival first' : formatDate(city.departure) || 'Select date'}</span>
                </button>
              </div>
              {editingDateCity === i && (
                <div className="animate-in slide-in-from-bottom-2 duration-200">
                  <ScrollDatePicker
                    label={editingDateField === 'arrival' ? 'Arrival date' : 'Departure date'}
                    value={city[editingDateField]}
                    onChange={(dateStr) => updateCity(i, editingDateField, dateStr)}
                  />
                  <button onClick={() => setEditingDateCity(null)} className="w-full mt-2 py-2 text-sm text-[#007AFF] font-medium">Done</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button onClick={next} disabled={!canContinue} className="w-full mt-6 py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 disabled:opacity-30 transition-opacity text-base">
          {submitLabel || 'Continue'}
        </button>
      </StepShell>
    );
  }

  // ─── Step: Transport ───
  if (currentStep === 'transport') {
    return (
      <StepShell title="How will you get around?" onBack={back} progress={progress}>
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
                    {city.departure && <span className="text-xs text-gray-400 ml-2">{formatDate(city.departure)}</span>}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {INTERCITY_TRANSPORT.map((t) => (
                      <button key={t.label} onClick={() => setLegTransportAt(legIdx, t.label)}
                        className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 text-xs font-medium transition-all ${selected === t.label ? 'border-[#007AFF] bg-[#007AFF]/5 text-[#007AFF]' : 'border-gray-100 bg-white text-gray-600 hover:border-gray-300'}`}>
                        <t.Icon className="text-lg" /> {t.label}
                      </button>
                    ))}
                  </div>
                  {selected && (
                    <div className="mt-3 space-y-2">
                      {selected === 'Bus' && (
                        <input type="text" placeholder="Operator / route (e.g. The Sinh Tourist)" value={(busDetails[legIdx] || {}).operator || ''}
                          onChange={(e) => { const u = [...busDetails]; u[legIdx] = { ...(u[legIdx] || {}), operator: e.target.value }; setBusDetails(u); }}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]" />
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Departure time</label>
                          <input type="time" value={(busDetails[legIdx] || {}).departureTime || ''}
                            onChange={(e) => { const u = [...busDetails]; u[legIdx] = { ...(u[legIdx] || {}), departureTime: e.target.value }; setBusDetails(u); }}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Arrival time</label>
                          <input type="time" value={(busDetails[legIdx] || {}).arrivalTime || ''}
                            onChange={(e) => { const u = [...busDetails]; u[legIdx] = { ...(u[legIdx] || {}), arrivalTime: e.target.value }; setBusDetails(u); }}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]" />
                        </div>
                      </div>
                      {selected === 'Bus' && (
                        <input type="text" placeholder="Booking ref (optional)" value={(busDetails[legIdx] || {}).bookingRef || ''}
                          onChange={(e) => { const u = [...busDetails]; u[legIdx] = { ...(u[legIdx] || {}), bookingRef: e.target.value }; setBusDetails(u); }}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]" />
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
              <button key={t.label} onClick={() => setLocalTransport(t.label)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left text-sm font-medium transition-all ${localTransport === t.label ? 'border-[#007AFF] bg-[#007AFF]/5 text-[#007AFF]' : 'border-gray-100 bg-white text-gray-700 hover:border-gray-300'}`}>
                <t.Icon className="text-lg" /> {t.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={next} disabled={!canContinue} className="w-full mt-6 py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 disabled:opacity-30 transition-opacity text-base">
          {submitLabel || 'Continue'}
        </button>
      </StepShell>
    );
  }

  // ─── Step: Interests ───
  if (currentStep === 'interests') {
    return (
      <StepShell title="What are you into?" subtitle="Pick as many as you like" onBack={back} progress={progress}>
        <div className="grid grid-cols-2 gap-2">
          {INTERESTS.map((interest) => (
            <button key={interest.label} onClick={() => toggleInterest(interest.label)}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left text-sm font-medium transition-all ${interests.includes(interest.label) ? 'border-[#007AFF] bg-[#007AFF]/5 text-[#007AFF]' : 'border-gray-100 bg-white text-gray-700 hover:border-gray-300'}`}>
              <span className="text-lg">{interest.icon}</span>
              {interest.label}
            </button>
          ))}
        </div>
        <button onClick={next} disabled={!canContinue} className="w-full mt-6 py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 disabled:opacity-30 transition-opacity text-base">
          {submitLabel || 'Continue'}
        </button>
      </StepShell>
    );
  }

  // ─── Step: Budget + Group ───
  if (currentStep === 'budget') {
    return (
      <StepShell title="Last details" onBack={back} progress={progress}>
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-500 mb-3">Budget level</p>
            <div className="space-y-2">
              {BUDGET_OPTIONS.map((b) => (
                <button key={b.value} onClick={() => setBudget(b.value)}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl border-2 text-left transition-all ${budget === b.value ? 'border-[#007AFF] bg-[#007AFF]/5' : 'border-gray-100 bg-white hover:border-gray-300'}`}>
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
              <button onClick={() => setGroupSize((g) => Math.max(1, g - 1))} className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 font-semibold text-lg hover:bg-gray-200 transition-colors">−</button>
              <span className="flex-1 text-center text-2xl font-semibold text-gray-900">{groupSize}</span>
              <button onClick={() => setGroupSize((g) => Math.min(20, g + 1))} className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 font-semibold text-lg hover:bg-gray-200 transition-colors">+</button>
            </div>
          </div>
        </div>
        {onSubmit && (
          <button onClick={handleSubmit} className="w-full mt-6 py-3.5 bg-[#007AFF] text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity text-base">
            {submitLabel || 'Find Activities →'}
          </button>
        )}
      </StepShell>
    );
  }

  return null;
}
