"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { loaderFor } from "@/lib/lucide-all-icons";

// Process-wide cache so the same icon never re-imports across remounts /
// route transitions. Lucide icons each ship as their own tiny ES module
// chunk, but kicking off the network request twice would still flash blank
// glyphs on revisit.
const componentCache = new Map<string, LucideIcon>();
const pendingCache = new Map<string, Promise<LucideIcon>>();

function loadOnce(name: string): Promise<LucideIcon> {
  const cached = componentCache.get(name);
  if (cached) return Promise.resolve(cached);
  const pending = pendingCache.get(name);
  if (pending) return pending;

  const loader = loaderFor(name);
  if (!loader) return Promise.reject(new Error(`No loader for icon "${name}"`));

  const p = loader().then((mod) => {
    const Component = mod.default;
    componentCache.set(name, Component);
    pendingCache.delete(name);
    return Component;
  });
  pendingCache.set(name, p);
  return p;
}

type Props = {
  /** Canonical kebab-case Lucide icon name (e.g. "rocket", "alarm-clock-check"). */
  name: string;
  size?: number;
  strokeWidth?: number;
};

/**
 * Renders a Lucide icon that's NOT in the curated catalog by lazy-loading its
 * module on first mount. Renders nothing while loading — callers should give
 * us a reserved-size container so layout doesn't shift when the glyph paints.
 */
export default function LazyLucideIcon({ name, size = 18, strokeWidth = 1.9 }: Props) {
  const [Component, setComponent] = useState<LucideIcon | null>(
    () => componentCache.get(name) ?? null,
  );

  useEffect(() => {
    if (Component) return;
    let cancelled = false;
    loadOnce(name)
      .then((C) => {
        if (!cancelled) setComponent(() => C);
      })
      .catch(() => {
        // Silent fail — caller's reserved space stays blank, which is the
        // same end state as "icon doesn't exist".
      });
    return () => {
      cancelled = true;
    };
  }, [name, Component]);

  if (!Component) return null;
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      style={{ flexShrink: 0, color: "currentColor" }}
    />
  );
}
