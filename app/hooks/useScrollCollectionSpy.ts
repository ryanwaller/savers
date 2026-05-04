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

  useEffect(() => {
    if (!enabled || collectionIds.length === 0) {
      setActiveCollection(null);
      return;
    }

    const scrollContainer = scrollContainerRef?.current || document.querySelector(".content");

    if (!scrollContainer) {
      console.warn("⚠️ Scroll spy: .content container not found, using viewport");
    }

    console.log("🔍 Initializing scroll spy for collections:", collectionIds);

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        console.log("📍 IntersectionObserver fired:", entries.length, "entries");

        const visible = entries.filter((e) => e.isIntersecting);

        if (visible.length === 0) {
          console.log("📍 No visible sections");
          setActiveCollection(null);
          return;
        }

        const sorted = visible.sort((a, b) => {
          return a.boundingClientRect.top - b.boundingClientRect.top;
        });

        const topmost = sorted[0].target.getAttribute("data-collection-path");
        console.log("📍 Active collection:", topmost);
        setActiveCollection(topmost);
      },
      {
        root: scrollContainer || null,
        rootMargin: "-20% 0px -60% 0px",
        threshold: 0,
      },
    );

    let observedCount = 0;
    collectionIds.forEach((id) => {
      const section = document.querySelector(`[data-collection="${id}"]`);
      if (section) {
        sectionsRef.current.set(id, section);
        observerRef.current!.observe(section);
        observedCount++;
      } else {
        console.warn(`⚠️ Section not found for collection: ${id}`);
      }
    });

    console.log(`✅ Observing ${observedCount} of ${collectionIds.length} sections`);

    return () => {
      observerRef.current?.disconnect();
      sectionsRef.current.clear();
    };
  }, [enabled, collectionIds, scrollContainerRef]);

  return activeCollection;
}
