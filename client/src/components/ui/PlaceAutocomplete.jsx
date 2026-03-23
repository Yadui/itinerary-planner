import { useState, useRef, useEffect } from 'react';

/**
 * Autocomplete input that queries the backend Places proxy.
 *
 * Props:
 *  - endpoint: "/api/places/autocomplete/city" or "/api/places/autocomplete/address"
 *  - extraParams: object of extra query params (e.g. { city: "Paris" })
 *  - value: controlled text value
 *  - onSelect: (suggestion) => void — fires when user picks a suggestion
 *  - onChange: (text) => void — fires on raw text change
 *  - placeholder, className
 */
export default function PlaceAutocomplete({
  endpoint,
  extraParams = {},
  value,
  onSelect,
  onChange,
  placeholder,
  className = '',
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleInputChange(text) {
    onChange(text);
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const params = new URLSearchParams({ input: text, ...extraParams });
      try {
        const res = await fetch(`${endpoint}?${params}`);
        const data = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }

  function handleSelect(suggestion) {
    onSelect(suggestion);
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e) {
    if (!open || !suggestions.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] ${className}`}
      />

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                i === activeIndex ? 'bg-[#007AFF]/5' : 'hover:bg-gray-50'
              }`}
            >
              <p className="font-medium text-gray-900 leading-tight">{s.mainText}</p>
              {s.secondaryText && (
                <p className="text-xs text-gray-400 mt-0.5">{s.secondaryText}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
