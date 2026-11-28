import { useEffect, useRef, useState } from 'react';
import { readPreferences, writePreferences } from '../core/preferences';
export function usePreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  const latest = useRef(preferences);
  latest.current = preferences;
  useEffect(() => {
    const timer = setTimeout(() => writePreferences(preferences), 150);
    return () => clearTimeout(timer);
  }, [preferences]);
  useEffect(() => {
    const flush = () => writePreferences(latest.current);
    const visibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return [preferences, setPreferences] as const;
}
