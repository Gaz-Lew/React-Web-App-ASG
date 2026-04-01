import React, { useState, useRef, useEffect } from 'react';
import { WA_SUBURBS } from '../data/waSuburbs';

interface SuburbInputProps {
  value: string;
  onChange: (suburb: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
}

export function SuburbInput({ value, onChange, className, placeholder = 'Suburb', id }: SuburbInputProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep query in sync with external value changes (e.g. when lead changes)
  useEffect(() => { setQuery(value); }, [value]);

  const handleChange = (q: string) => {
    setQuery(q);
    onChange(q);
    if (q.length >= 1) {
      const lower = q.toLowerCase();
      // Prefix matches first, then contains matches
      const prefix = WA_SUBURBS.filter(s => s.toLowerCase().startsWith(lower));
      const contains = WA_SUBURBS.filter(s => !s.toLowerCase().startsWith(lower) && s.toLowerCase().includes(lower));
      setSuggestions([...prefix, ...contains].slice(0, 8));
      setOpen(true);
    } else {
      setSuggestions([]);
      setOpen(false);
    }
  };

  const handleSelect = (suburb: string) => {
    setQuery(suburb);
    onChange(suburb);
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        value={query}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => {
          if (query.length >= 1 && suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-[70] left-0 right-0 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.08] rounded-lg shadow-xl mt-0.5 max-h-48 overflow-y-auto">
          {suggestions.map(s => (
            <li
              key={s}
              onMouseDown={() => handleSelect(s)}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-amber-50 dark:hover:bg-[var(--hover)] text-gray-800 dark:text-gray-200"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
