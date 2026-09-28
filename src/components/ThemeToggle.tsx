'use client';

import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const ORDER: Theme[] = ['system', 'light', 'dark'];

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => setTheme(readTheme()), []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme ?? 'system') + 1) % ORDER.length];
    setTheme(next);
    try {
      if (next === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch {
      // storage unavailable; the choice lasts for this page only
    }
    if (next === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="label cursor-pointer hover:text-ink"
      aria-label={`Theme: ${theme ?? 'system'}. Click to change.`}
      title="Theme: system, light, dark"
    >
      <span className="inline-block min-w-[6ch] text-left">{theme ?? 'system'}</span>
    </button>
  );
}

/** Inline script applied before paint so the stored theme never flashes. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
