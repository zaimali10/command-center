import { useState, useEffect, useRef, useCallback } from 'react';

export function usePollingFetch(url, interval, options = {}) {
  const {
    transform,
    retry = 2,
    onError,
    enabled = true,
    deps = [],
    responseType = 'json' // 'json' or 'text'
  } = options;

  // Internal state
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Refs
  const inFlightRef = useRef(null);
  const mountedRef = useRef(true);
  const timerRef = useRef(null);
  const firstLoadDoneRef = useRef(false);

  // Stable fetch function
  const doFetch = useCallback(async () => {
    // Deduplication check
    if (inFlightRef.current) {
      return;
    }

    // Skip if document is hidden
    if (document.hidden) {
      // Reschedule
      if (interval > 0) {
        timerRef.current = setTimeout(doFetch, interval);
      }
      return;
    }

    // Set loading state
    if (firstLoadDoneRef.current) {
      if (mountedRef.current) setIsRefreshing(true);
    } else {
      if (mountedRef.current) setIsLoading(true);
    }

    // Create abort controller
    const controller = new AbortController();
    inFlightRef.current = controller;

    let attempts = 0;
    let lastError = null;

    while (attempts <= retry) {
      try {
        // Add cache busting to prevent stale responses
        const cacheBustUrl = url.includes('?')
          ? `${url}&_=${Date.now()}`
          : `${url}?_=${Date.now()}`;
        const response = await fetch(cacheBustUrl, { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const rawData = responseType === 'text' ? await response.text() : await response.json();
        const transformedData = transform ? transform(rawData) : rawData;

        // Success - update state only if still mounted
        if (mountedRef.current) {
          setData(transformedData);
          setError(null);
          setLastUpdated(Date.now());
        }
        break;
      } catch (err) {
        if (err.name === 'AbortError') {
          // Request was cancelled
          return;
        }

        lastError = err;
        attempts++;

        if (attempts <= retry) {
          // Wait before retry with exponential backoff
          const backoffDelay = Math.min(500 * Math.pow(2, attempts - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }

    // All retries exhausted - handle error
    if (lastError) {
      if (mountedRef.current) {
        setError(lastError);
        if (onError) onError(lastError);
        // Keep existing data (don't clear it)
      }
    }

    // Cleanup and schedule next
    inFlightRef.current = null;
    if (mountedRef.current) {
      setIsLoading(false);
      setIsRefreshing(false);
    }
    firstLoadDoneRef.current = true;

    // Schedule next poll if interval > 0
    if (interval > 0) {
      timerRef.current = setTimeout(doFetch, interval);
    }
  }, [url, interval, transform, retry, onError]);

  // Stable refetch function
  const refetch = useCallback(async () => {
    // Cancel any in-flight request
    if (inFlightRef.current) {
      inFlightRef.current.abort();
      inFlightRef.current = null;
    }

    // Clear any scheduled timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Trigger immediate fetch
    await doFetch();
  }, [doFetch]);

  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible - trigger immediate fetch if we were skipping
        doFetch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [doFetch]);

  // Main polling effect
  useEffect(() => {
    if (!enabled) {
      // Clear any running timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Abort any in-flight request
      if (inFlightRef.current) {
        inFlightRef.current.abort();
        inFlightRef.current = null;
      }
      return;
    }

    // Reset state on URL/interval/deps change
    firstLoadDoneRef.current = false;

    // Abort any in-flight request
    if (inFlightRef.current) {
      inFlightRef.current.abort();
      inFlightRef.current = null;
    }

    // Clear any running timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Start fetching
    doFetch();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (inFlightRef.current) {
        inFlightRef.current.abort();
      }
    };
  }, [url, interval, enabled, ...deps, doFetch]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (inFlightRef.current) {
        inFlightRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    lastUpdated,
    refetch
  };
}

export default usePollingFetch;