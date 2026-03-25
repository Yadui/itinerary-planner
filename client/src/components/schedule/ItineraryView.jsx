import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import DraggableItem from './DraggableItem';
import {
  buildTravelMatrix,
  reorderInDay,
  moveAcrossDays,
  removeItem,
  recalcAndValidate,
} from '../../lib/scheduler';
import { api } from '../../lib/api';
import { displayName, userColor } from '../../hooks/usePresence';

export default function ItineraryView({ itinerary: initialItinerary, activities, tripConfig, readOnly, onItineraryChange, onEditingTarget, editingUsers }) {
  const [itinerary, setItinerary] = useState(null);
  const [optimizing, setOptimizing] = useState(null);

  // Wrapper: update local state + notify parent of user edits
  function updateItinerary(newItinerary) {
    setItinerary(newItinerary);
    if (onItineraryChange) onItineraryChange(newItinerary);
  }

  const travelMatrix = useMemo(
    () => buildTravelMatrix(initialItinerary?.activities ?? activities ?? []),
    [initialItinerary, activities]
  );

  // On mount or when backend returns new data, recalc + validate locally
  useEffect(() => {
    if (!initialItinerary?.days) return;
    const withCalc = recalcAndValidate(initialItinerary, travelMatrix);
    setItinerary(withCalc);
  }, [initialItinerary, travelMatrix]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  if (!itinerary?.days?.length) {
    return <p className="text-gray-400 text-sm">No itinerary generated yet.</p>;
  }

  // ─── Handlers ───

  function handleDragEnd(event, dayIndex) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const items = itinerary.days[dayIndex].items;
    const oldIndex = items.findIndex((it) => it.place_id === active.id);
    const newIndex = items.findIndex((it) => it.place_id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onEditingTarget?.(`day:${dayIndex}`);
    updateItinerary(reorderInDay(itinerary, dayIndex, oldIndex, newIndex, travelMatrix));
    setTimeout(() => onEditingTarget?.(null), 2000);
  }

  function handleMoveToDay(fromDay, fromIndex, toDay) {
    onEditingTarget?.(`day:${fromDay}`);
    updateItinerary(moveAcrossDays(itinerary, fromDay, fromIndex, toDay, itinerary.days[toDay].items.length, travelMatrix));
    setTimeout(() => onEditingTarget?.(null), 2000);
  }

  function handleRemove(dayIndex, itemIndex) {
    onEditingTarget?.(`day:${dayIndex}`);
    updateItinerary(removeItem(itinerary, dayIndex, itemIndex, travelMatrix));
    setTimeout(() => onEditingTarget?.(null), 2000);
  }

  async function handleOptimizeDay(dayIndex) {
    const day = itinerary.days[dayIndex];
    if (!day.items.length) return;

    setOptimizing(dayIndex);
    try {
      // Build stay location from tripConfig or first activity
      const stayLocation = tripConfig?.cities?.[0]?.location
        ?? initialItinerary?.activities?.[0]
        ?? { lat: day.items[0].lat, lng: day.items[0].lng };

      const result = await api.optimizeDay({
        date: day.date,
        activities: day.items.map((it) => ({
          place_id: it.place_id,
          name: it.name,
          lat: it.lat,
          lng: it.lng,
          types: it.types ?? [],
          duration: it.duration,
          rating: it.rating,
          address: it.address,
        })),
        stay_location: { lat: stayLocation.lat, lng: stayLocation.lng },
      });

      // Verify Claude returned the same place_ids (no drops, no inventions)
      const originalIds = new Set(day.items.map((it) => it.place_id));
      const returnedIds = new Set(result.items.map((it) => it.place_id));
      const missing = [...originalIds].filter((id) => !returnedIds.has(id));
      const invented = [...returnedIds].filter((id) => !originalIds.has(id));

      if (invented.length > 0) {
        console.warn('Claude invented activities — ignoring optimization');
        return;
      }

      // Merge: keep our rich item data, apply Claude's ordering + times
      const itemMap = new Map(day.items.map((it) => [it.place_id, it]));
      const reorderedItems = result.items
        .filter((ri) => itemMap.has(ri.place_id))
        .map((ri) => ({
          ...itemMap.get(ri.place_id),
          start_time: ri.start_time,
          end_time: ri.end_time,
        }));

      // Add back any missing items at the end
      for (const id of missing) {
        reorderedItems.push(itemMap.get(id));
      }

      const days = itinerary.days.map((d, i) =>
        i === dayIndex ? { ...d, items: reorderedItems } : d
      );

      updateItinerary(recalcAndValidate({ ...itinerary, days }, travelMatrix, [dayIndex]));
    } catch (err) {
      console.error('Optimize failed:', err);
    } finally {
      setOptimizing(null);
    }
  }

  // ─── Render ───

  const allValid = itinerary.validation?.valid !== false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Your Itinerary</h2>
        <div className="flex items-center gap-2">
          {!allValid && (
            <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full font-medium">Has issues</span>
          )}
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
            {itinerary.days.length} days
          </span>
        </div>
      </div>

      {itinerary.days.map((day, dayIndex) => {
        const hasErrors = day.items.some((it) => it.errors?.length > 0);
        const hasWarnings = day.items.some((it) => it.warnings?.length > 0) || day.dayIssues?.length > 0;

        // Users currently editing this day
        const dayEditors = editingUsers
          ? [...editingUsers.values()].filter((u) => u.editing_target === `day:${dayIndex}`)
          : [];

        return (
          <div key={dayIndex} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Day header */}
            <div className="px-5 py-3 bg-gradient-to-r from-[#007AFF]/5 to-transparent border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">
                    {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long', month: 'short', day: 'numeric',
                    })}
                  </h3>
                  {hasErrors && <span className="w-2 h-2 rounded-full bg-red-500" />}
                  {hasWarnings && !hasErrors && <span className="w-2 h-2 rounded-full bg-amber-400" />}
                  {!hasErrors && !hasWarnings && day.items.length > 0 && <span className="w-2 h-2 rounded-full bg-green-400" />}
                </div>
                <div className="flex items-center gap-2">
                  {dayEditors.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="flex -space-x-1">
                        {dayEditors.slice(0, 3).map((u, i) => (
                          <div
                            key={i}
                            title={`${displayName(u.email)} is editing`}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold ring-2 ring-white"
                            style={{ backgroundColor: userColor(u.email) }}
                          >
                            {displayName(u.email).charAt(0).toUpperCase()}
                          </div>
                        ))}
                      </div>
                      <span className="text-[10px] text-amber-500 font-medium">editing</span>
                    </div>
                  )}
                  {day.city && <span className="text-xs text-[#007AFF] font-medium">{day.city}</span>}
                  {!readOnly && day.items.length > 1 && (
                    <button
                      onClick={() => handleOptimizeDay(dayIndex)}
                      disabled={optimizing !== null}
                      className="text-xs text-[#007AFF] hover:opacity-70 font-medium disabled:opacity-40"
                    >
                      {optimizing === dayIndex ? 'Optimizing…' : 'Optimize'}
                    </button>
                  )}
                </div>
              </div>
              {/* Day-level issues */}
              {day.dayIssues?.map((iss, k) => (
                <p key={k} className={`text-xs mt-1 ${iss.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}>
                  {iss.message}
                </p>
              ))}
            </div>

            {/* Sortable activities */}
            {day.items.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-gray-300">No activities</div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleDragEnd(e, dayIndex)}
              >
                <SortableContext
                  items={day.items.map((it) => it.place_id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="divide-y divide-gray-50">
                    {day.items.map((item, itemIndex) => (
                      <DraggableItem
                        key={item.place_id}
                        item={item}
                        index={itemIndex}
                        dayIndex={dayIndex}
                        totalDays={itinerary.days.length}
                        onRemove={handleRemove}
                        onMoveToDay={handleMoveToDay}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        );
      })}
    </div>
  );
}
