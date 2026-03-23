import { useState, useMemo, useEffect } from 'react';
import Picker from 'react-mobile-picker';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function daysInMonth(month, year) {
  return new Date(year, month + 1, 0).getDate();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d)) return null;
  return d;
}

/**
 * iOS-style scroll wheel date picker with optional text input.
 */
export default function ScrollDatePicker({ value, onChange, label }) {
  const today = new Date();
  const currentYear = today.getFullYear();

  const parsed = parseDate(value) || today;
  const [pickerValue, setPickerValue] = useState({
    month: MONTHS[parsed.getMonth()],
    day: String(parsed.getDate()),
    year: String(parsed.getFullYear()),
  });
  const [textInput, setTextInput] = useState('');
  const [showText, setShowText] = useState(false);

  // Sync picker when value changes externally
  useEffect(() => {
    const d = parseDate(value);
    if (d) {
      setPickerValue({
        month: MONTHS[d.getMonth()],
        day: String(d.getDate()),
        year: String(d.getFullYear()),
      });
    }
  }, [value]);

  const years = useMemo(() => {
    const result = [];
    for (let y = currentYear; y <= currentYear + 2; y++) result.push(String(y));
    return result;
  }, [currentYear]);

  const monthIdx = MONTHS.indexOf(pickerValue.month);
  const yearNum = parseInt(pickerValue.year);
  const maxDay = daysInMonth(monthIdx, yearNum);
  const days = useMemo(() => {
    return Array.from({ length: maxDay }, (_, i) => String(i + 1));
  }, [maxDay]);

  function handleChange(newVal) {
    const mi = MONTHS.indexOf(newVal.month);
    const yr = parseInt(newVal.year);
    const max = daysInMonth(mi, yr);
    const day = Math.min(parseInt(newVal.day), max);
    const clamped = { ...newVal, day: String(day) };

    setPickerValue(clamped);
    const dateStr = `${clamped.year}-${pad(mi + 1)}-${pad(day)}`;
    onChange(dateStr);
  }

  function handleTextSubmit() {
    // Try parsing various formats: MM/DD/YYYY, DD-MM-YYYY, YYYY-MM-DD, etc.
    const cleaned = textInput.trim();
    if (!cleaned) return;

    let d = null;
    // Try MM/DD/YYYY or MM-DD-YYYY
    const slashMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (slashMatch) {
      d = new Date(parseInt(slashMatch[3]), parseInt(slashMatch[1]) - 1, parseInt(slashMatch[2]));
    }
    // Try YYYY-MM-DD
    if (!d || isNaN(d)) {
      const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (isoMatch) {
        d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      }
    }
    // Try natural: "Mar 22" or "March 22 2026"
    if (!d || isNaN(d)) {
      d = new Date(cleaned);
    }

    if (d && !isNaN(d) && d.getFullYear() >= currentYear) {
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      onChange(dateStr);
      setShowText(false);
      setTextInput('');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {label && <p className="text-xs text-gray-400">{label}</p>}
        <button
          type="button"
          onClick={() => setShowText(!showText)}
          className="text-xs text-[#007AFF] hover:underline"
        >
          {showText ? 'Use scroller' : 'Type date'}
        </button>
      </div>

      {showText ? (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="MM/DD/YYYY"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
            className="flex-1 px-3 py-3 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]"
            autoFocus
          />
          <button
            type="button"
            onClick={handleTextSubmit}
            className="px-4 py-3 rounded-2xl bg-[#007AFF] text-white text-sm font-medium"
          >
            Set
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden picker-slow">
          <Picker
            value={pickerValue}
            onChange={handleChange}
            wheelMode="natural"
            height={180}
            itemHeight={44}
          >
            <Picker.Column name="month">
              {MONTHS.map((m) => (
                <Picker.Item key={m} value={m}>
                  {({ selected }) => (
                    <span className={`text-base ${selected ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                      {m}
                    </span>
                  )}
                </Picker.Item>
              ))}
            </Picker.Column>
            <Picker.Column name="day">
              {days.map((d) => (
                <Picker.Item key={d} value={d}>
                  {({ selected }) => (
                    <span className={`text-base ${selected ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                      {d}
                    </span>
                  )}
                </Picker.Item>
              ))}
            </Picker.Column>
            <Picker.Column name="year">
              {years.map((y) => (
                <Picker.Item key={y} value={y}>
                  {({ selected }) => (
                    <span className={`text-base ${selected ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                      {y}
                    </span>
                  )}
                </Picker.Item>
              ))}
            </Picker.Column>
          </Picker>
        </div>
      )}
    </div>
  );
}
