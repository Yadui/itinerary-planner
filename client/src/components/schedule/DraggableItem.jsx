import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function DraggableItem({ item, index, dayIndex, totalDays, onRemove, onMoveToDay, readOnly }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.place_id,
    disabled: readOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasError = item.errors?.length > 0;
  const hasWarning = item.warnings?.length > 0;

  return (
    <div ref={setNodeRef} style={style} className={`px-5 py-3 flex items-start gap-3 ${hasError ? 'bg-red-50/50' : ''}`}>
      {/* Drag handle */}
      {!readOnly && (
        <div
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0 select-none"
        >
          ⠿
        </div>
      )}

      {/* Time badge */}
      <div className="flex flex-col items-center flex-shrink-0 w-14">
        <span className="text-xs font-medium text-[#007AFF]">{item.start_time}</span>
        <div className="w-px h-3 bg-gray-200 my-0.5" />
        <span className="text-xs text-gray-400">{item.end_time}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{item.name}</p>
          {hasError && <span className="w-4 h-4 rounded-full bg-red-100 text-red-500 text-xs flex items-center justify-center flex-shrink-0">!</span>}
          {hasWarning && !hasError && <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-500 text-xs flex items-center justify-center flex-shrink-0">!</span>}
        </div>
        {item.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.address}</p>}
        <span className="text-xs text-gray-300">{item.duration}min</span>

        {/* Inline errors */}
        {item.errors?.map((msg, k) => (
          <p key={`e${k}`} className="text-xs text-red-500 mt-0.5">{msg}</p>
        ))}
        {/* Inline warnings */}
        {item.warnings?.map((msg, k) => (
          <p key={`w${k}`} className="text-xs text-amber-500 mt-0.5">{msg}</p>
        ))}
      </div>

      {/* Actions */}
      {!readOnly && (
        <div className="flex flex-col gap-1 flex-shrink-0">
          {item.rating && (
            <span className="text-xs text-amber-500">★ {item.rating}</span>
          )}
          {/* Move to another day */}
          {totalDays > 1 && (
            <select
              className="text-xs text-gray-400 bg-transparent border-none cursor-pointer focus:outline-none"
              value=""
              onChange={(e) => {
                const targetDay = Number(e.target.value);
                if (!isNaN(targetDay)) onMoveToDay(dayIndex, index, targetDay);
              }}
            >
              <option value="" disabled>Move…</option>
              {Array.from({ length: totalDays }, (_, i) => i)
                .filter((i) => i !== dayIndex)
                .map((i) => (
                  <option key={i} value={i}>Day {i + 1}</option>
                ))
              }
            </select>
          )}
          <button
            onClick={() => onRemove(dayIndex, index)}
            className="text-xs text-red-400 hover:text-red-600 text-left"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
