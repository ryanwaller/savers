"use client";
import { useState, useEffect, useRef } from "react";

export function useScrollCollectionSpy(enabled: boolean) {
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleMapRef = useRef<Map<Element, boolean>>(new Map());

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        visibleMapRef.current.set(entry.target, entry.isIntersecting);
      }

      let topmost: Element | null = null;
      let topmostTop = Infinity;

      for (const [el, visible] of visibleMapRef.current) {
        if (!visible) continue;
        const top = el.getBoundingClientRect().top;
        if (top < topmostTop) {
          topmostTop = top;
          topmost = el;
        }
      }

      setActiveCollection(
        topmost ? topmost.getAttribute("data-collection") || null : null,
      );
    };

    const root = document.querySelector(".content");

    observerRef.current = new IntersectionObserver(handleIntersect, {
      root,
      rootMargin: "0px 0px 0px 0px",
      threshold: 0,
    });

    const observe = () => {
      const sections = document.querySelectorAll("[data-collection]");
      for (const el of sections) observerRef.current?.observe(el);
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
