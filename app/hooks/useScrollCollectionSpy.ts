"use client";
import { useState, useEffect, useRef } from "react";

export function useScrollCollectionSpy(enabled: boolean) {
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (visible.length > 0) {
        setActiveCollection(
          visible[0].target.getAttribute("data-collection") || null,
        );
      } else {
        setActiveCollection(null);
      }
    };

    const getScrollRoot = () => {
      const content = document.querySelector(".content");
      if (!content) return null;
      const style = window.getComputedStyle(content);
      if (style.overflowY === "auto" || style.overflowY === "scroll") return content;
      const main = document.querySelector(".main");
      if (main) {
        const mainStyle = window.getComputedStyle(main);
        if (mainStyle.overflowY === "auto" || mainStyle.overflowY === "scroll") return main;
      }
      return null;
    };

    const root = getScrollRoot();

    observerRef.current = new IntersectionObserver(handleIntersect, {
      root,
      rootMargin: "-40% 0px -40% 0px",
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });

    const observe = () => {
      const sections = document.querySelectorAll("[data-collection]");
      sections.forEach((el) => observerRef.current?.observe(el));
    };
    observe();

    const mo = new MutationObserver(observe);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      observerRef.current?.disconnect();
      mo.disconnect();
    };
  }, [enabled]);

  return activeCollection;
}
