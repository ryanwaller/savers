"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useClientMounted } from "@/app/hooks/useClientMounted";

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
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(loadCollapsedIds);
  const ready = useClientMounted();
  const initialLoadDone = useRef(false);

  // Persist to localStorage whenever state changes, but only after
  // the initial load completes to avoid overwriting saved state.
  useEffect(() => {
    if (!ready) return;
    persistCollapsedIds(collapsedIds);
  }, [ready, collapsedIds]);

  // Only after the first persist cycle is committed, allow syncWithValidIds
  // to run. Before this point, the tree may be empty or stale and
  // syncWithValidIds would prune all loaded IDs, which the persist effect
  // would then cement into localStorage as permanent data loss.
  useEffect(() => {
    if (ready) {
      initialLoadDone.current = true;
    }
  }, [ready, collapsedIds]);

  const isExpanded = useCallback(
    (id: string) => !ready || !collapsedIds.has(id),
    [ready, collapsedIds],
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
    if (!initialLoadDone.current) return;
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
