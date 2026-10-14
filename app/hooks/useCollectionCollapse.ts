"use client";
import { useState, useEffect, useCallback } from "react";
import { useClientMounted } from "./useClientMounted";

const STORAGE_KEY = "savers_collection_collapse_state";

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

export function useCollectionCollapse() {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(loadCollapsedIds);
  const ready = useClientMounted();

  // Persist to localStorage whenever state changes, but only after
  // the initial load completes to avoid overwriting saved state.
  useEffect(() => {
    if (!ready) return;
    persistCollapsedIds(collapsedIds);
  }, [ready, collapsedIds]);

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

  const isCollapsed = useCallback(
    (id: string) => ready && collapsedIds.has(id),
    [ready, collapsedIds],
  );

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  const collapseAll = useCallback((ids: string[]) => {
    setCollapsedIds(new Set(ids));
  }, []);

  return {
    collapsedIds,
    toggle,
    isCollapsed,
    expandAll,
    collapseAll,
  };
}
