import { useCallback, useEffect, useRef, useState } from "react";
import { isContractConfigured } from "../lib/networks";

export interface Polled<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Loads `fetcher()` now, then every `pollMs`. Stays idle (not loading, no error) when no contract is
 * configured or `enabled` is false. Reloads whenever `deps` change and clears stale data first.
 */
export function usePolled<T>(fetcher: () => Promise<T>, deps: unknown[], pollMs: number, enabled = true): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!isContractConfigured || !enabled) {
      if (mounted.current) setLoading(false);
      return;
    }
    try {
      const v = await fetchRef.current();
      if (!mounted.current) return;
      setData(v);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "Could not read from the network.");
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);
    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  return { data, loading, error, refresh };
}
