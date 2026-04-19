"use client";

import { iconComponentByName } from "@/lib/icons";

type Props = {
  /** Phosphor icon name or null/undefined for the default folder glyph. */
  name?: string | null;
  /** Pixel size (width + height). Default 14 to match sidebar font. */
  size?: number;
  /** Optional aria-label. Default is "" (decorative). */
  ariaLabel?: string;
};

/**
 * Renders a single-color glyph for a collection. Uses the Phosphor icon by
 * name; falls back to `Folder` if the name is missing or not in the catalog.
 */
export default function CollectionIcon({ name, size = 14, ariaLabel = "" }: Props) {
  // eslint-disable-next-line react-hooks/static-components
  const Icon = iconComponentByName(name);
  return (
    <Icon
      size={size}
      weight="regular"
      aria-label={ariaLabel || undefined}
      aria-hidden={ariaLabel ? undefined : true}
      style={{ flexShrink: 0, color: "currentColor" }}
    />
  );
}
