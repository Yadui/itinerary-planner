function Stars({ rating }) {
  if (!rating) return null;
  return (
    <span className="text-xs text-amber-500 font-medium">
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))} {rating.toFixed(1)}
    </span>
  );
}

function PriceLevel({ level }) {
  if (level == null) return null;
  const labels = ['Free', '$', '$$', '$$$', '$$$$'];
  return <span className="text-xs text-gray-400">{labels[level]}</span>;
}

export default function ActivityCard({ place, selected, onToggle }) {
  return (
    <div
      onClick={onToggle}
      className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all border-2 ${
        selected ? 'border-[#007AFF] shadow-md' : 'border-transparent shadow-sm hover:shadow-md'
      } bg-white`}
    >
      {/* Photo */}
      {place.photo ? (
        <img src={place.photo} alt={place.name} className="w-full h-32 object-cover" />
      ) : (
        <div className="w-full h-32 bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
          <span className="text-3xl">📍</span>
        </div>
      )}

      {/* Selected badge */}
      {selected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-[#007AFF] rounded-full flex items-center justify-center">
          <span className="text-white text-xs">✓</span>
        </div>
      )}

      {/* Instagram tag */}
      {place.source === 'instagram' && (
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center gap-1">
          <span className="text-white text-[10px] font-semibold">IG Reel</span>
        </div>
      )}

      {/* Info */}
      <div className="p-3 space-y-1">
        <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-1">{place.name}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Stars rating={place.rating} />
          <PriceLevel level={place.priceLevel} />
          {place.userRatingsTotal && (
            <span className="text-xs text-gray-300">({place.userRatingsTotal.toLocaleString()})</span>
          )}
        </div>
        <p className="text-xs text-gray-400 line-clamp-1">{place.address}</p>
      </div>
    </div>
  );
}
