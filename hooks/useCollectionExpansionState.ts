"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "savers.sidebar.collapsedCollections";

function loadCollapsedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // corrupted data — reset
  }
  return new Set();
}

function persistCollapsedIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // storage full or unavailable — ignore
  }
}

/**
 * Persists sidebar collection expanded/collapsed state in localStorage.
 * Stores collapsed IDs internally so new or unknown collections default to expanded.
 * Survives page reloads and browser restarts.
 */
export function useCollectionExpansionState() {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const loadedRef = useRef(false);

  // Load persisted state after hydration (client-side only).
  // SSR returns empty Set; the real localStorage read happens here once.
  useEffect(() => {
    const saved = loadCollapsedIds();
    if (saved.size > 0) {
      setCollapsedIds(saved);
    }
    loadedRef.current = true;
  }, []);

  // Persist to localStorage whenever state changes, but only after
  // the initial load to avoid overwriting saved state with empty SSR state.
  useEffect(() => {
    if (loadedRef.current) {
      persistCollapsedIds(collapsedIds);
    }
  }, [collapsedIds]);

  const isExpanded = useCallback(
    (id: string) => !collapsedIds.has(id),
    [collapsedIds],
  );

  const toggle = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback((ids: string[]) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        next.delete(id);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, []);

  const collapseAll = useCallback((ids: string[]) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        next.add(id);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, []);

  const syncWithValidIds = useCallback((validIds: Set<string>) => {
    setCollapsedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id);
        }
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, []);

  return { isExpanded, toggle, expandAll, collapseAll, syncWithValidIds };
}
