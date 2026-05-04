"use client";
import { useState, useEffect } from "react";

const STORAGE_KEY = "savers_collection_collapse_state";

export function useCollectionCollapse() {
  // Initialize from localStorage (lazy to avoid hydration mismatch)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (e) {
      console.error("Failed to load collection collapse state:", e);
      return new Set();
    }
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsedIds]));
    } catch (e) {
      console.error("Failed to save collection collapse state:", e);
    }
  }, [collapsedIds]);

  // Toggle collapse state for a collection
  const toggle = (collectionId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(collectionId)) {
        next.delete(collectionId);
      } else {
        next.add(collectionId);
      }
      return next;
    });
  };

  // Check if a collection is collapsed
  const isCollapsed = (collectionId: string) => {
    return collapsedIds.has(collectionId);
  };

  // Expand all (optional utility)
  const expandAll = () => {
    setCollapsedIds(new Set());
  };

  // Collapse all (optional utility)
  const collapseAll = (collectionIds: string[]) => {
    setCollapsedIds(new Set(collectionIds));
  };

  return {
    collapsedIds,
    toggle,
    isCollapsed,
    expandAll,
    collapseAll,
  };
}
