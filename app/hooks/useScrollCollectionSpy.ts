"use client";
import { useState, useEffect, useRef } from "react";

interface UseScrollCollectionSpyOptions {
  enabled: boolean;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  collectionIds: string[];
}

export function useScrollCollectionSpy({
  enabled,
  scrollContainerRef,
  collectionIds,
}: UseScrollCollectionSpyOptions) {
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sectionsRef = useRef<Map<string, Element>>(new Map());
  const lastActiveRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || collectionIds.length === 0) {
      setActiveCollection(null);
      lastActiveRef.current = null;
      return;
    }

    const scrollContainer =
      scrollContainerRef?.current ||
      document.querySelector(".main") ||
      document.querySelector(".content");

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);

        if (visible.length === 0) {
          // Keep the last-known collection instead of reverting to null.
          // The rootMargin means we only detect sections near the top,
          // so between sections we hold the previous one.
          return;
        }

        const sorted = visible.sort((a, b) => {
          return a.boundingClientRect.top - b.boundingClientRect.top;
        });

        const topmost = sorted[0].target.getAttribute("data-collection-path");
        if (topmost && topmost !== lastActiveRef.current) {
          lastActiveRef.current = topmost;
          setActiveCollection(topmost);
        }
      },
      {
        root: scrollContainer || null,
        rootMargin: "-20% 0px -60% 0px",
        threshold: 0,
      },
    );

    collectionIds.forEach((id) => {
      const section = document.querySelector(`[data-collection="${id}"]`);
      if (section) {
        sectionsRef.current.set(id, section);
        observerRef.current!.observe(section);
      }
    });

    return () => {
      observerRef.current?.disconnect();
      sectionsRef.current.clear();
    };
  }, [enabled, collectionIds, scrollContainerRef]);

  return activeCollection;
}
