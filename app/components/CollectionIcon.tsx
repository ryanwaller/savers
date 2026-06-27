"use client";

import { createElement } from "react";
import { iconComponentByName, isCuratedIconName } from "@/lib/icons";
import { isLucideIconName } from "@/lib/lucide-all-icons";
import LazyLucideIcon from "./LazyLucideIcon";

type Props = {
  /** Icon name (curated PascalCase or kebab Lucide name) or null/undefined. */
  name?: string | null;
  /** Pixel size (width + height). Default 14 to match sidebar font. */
  size?: number;
  /** Optional aria-label. Default is "" (decorative). */
  ariaLabel?: string;
};

/**
 * Renders a single-color glyph for a collection.
 *
 * Two code paths:
 *  - If `name` matches the curated catalog (PascalCase or one of its legacy
 *    aliases) we render the bundled Lucide component synchronously — same
 *    behavior as before.
 *  - If `name` matches a kebab-case Lucide icon outside the curated set, we
 *    lazy-import that icon's module on first paint via `LazyLucideIcon`.
 *
 * Anything unrecognized falls back to the default folder glyph.
 */
export default function CollectionIcon({ name, size = 14, ariaLabel = "" }: Props) {
  if (name && !isCuratedIconName(name) && isLucideIconName(name)) {
    return (
      <span
        aria-label={ariaLabel || undefined}
        aria-hidden={ariaLabel ? undefined : true}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          flexShrink: 0,
          color: "currentColor",
        }}
      >
        <LazyLucideIcon name={name} size={size} strokeWidth={1.9} />
      </span>
    );
  }

  // `iconComponentByName` is a lookup into a static map of bundled Lucide
  // components — not a component factory. We use `createElement` here so the
  // react-hooks/static-components lint rule doesn't mistake the dynamic
  // lookup for an inline-component definition.
  const Icon = iconComponentByName(name);
  return createElement(Icon, {
    size,
    strokeWidth: 1.9,
    "aria-label": ariaLabel || undefined,
    "aria-hidden": ariaLabel ? undefined : true,
    style: { flexShrink: 0, color: "currentColor" },
  });
}
