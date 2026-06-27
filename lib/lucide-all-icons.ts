/**
 * Full Lucide catalog, dynamically loaded.
 *
 * `lucide-react/dynamicIconImports` ships ~1,990 keys, but many of them are
 * aliases that point at the same underlying icon module (e.g. "alarm-check"
 * and "alarm-clock-check" both `import('./icons/alarm-clock-check.mjs')`).
 * We dedupe by the import path so the picker shows each glyph exactly once
 * (~1,560 unique icons), then keep a flat searchable list.
 *
 * Each icon module is its own webpack/turbopack chunk — so a single
 * `loaderFor("rocket")()` only downloads ~600 bytes. We don't preload anything
 * here; the picker mounts an IntersectionObserver per cell and only triggers
 * the dynamic import when the cell scrolls into view.
 */

import dynamicIconImports from "lucide-react/dynamicIconImports";
import type { LucideIcon } from "lucide-react";

type IconLoader = () => Promise<{ default: LucideIcon }>;

export type LucideIconEntry = {
  /** Kebab-case canonical name, e.g. "alarm-clock-check". */
  name: string;
  /** Aliases that also resolve to this icon ("alarm-check" for the above). */
  aliases: string[];
  /** Searchable lowercase keywords (canonical name + aliases, hyphens split). */
  searchTokens: string[];
  loader: IconLoader;
};

// Pull every entry, group by underlying module path.
const byFile = new Map<
  string,
  { canonical: string; aliases: string[]; loader: IconLoader }
>();

for (const [name, loader] of Object.entries(dynamicIconImports as Record<string, IconLoader>)) {
  // The loader bodies look like `() => import('./icons/alarm-clock.mjs')` —
  // pull the filename out so we can dedupe aliases that share a module.
  const src = loader.toString();
  const match = src.match(/icons\/([a-z0-9-]+)\.mjs/);
  if (!match) continue;
  const file = match[1];

  const existing = byFile.get(file);
  if (!existing) {
    // First time we've seen this module — assume this name is the canonical
    // one for now. We'll keep the *shortest* canonical, since that's almost
    // always the "real" Lucide name; aliases tend to be longer or older
    // names kept around for compat.
    byFile.set(file, { canonical: name, aliases: [], loader });
  } else {
    // We've seen the module before — pick whichever name is canonical and
    // bucket the rest as aliases.
    if (name.length < existing.canonical.length) {
      existing.aliases.push(existing.canonical);
      existing.canonical = name;
    } else {
      existing.aliases.push(name);
    }
  }
}

function tokensFor(canonical: string, aliases: string[]): string[] {
  const tokens = new Set<string>();
  for (const n of [canonical, ...aliases]) {
    tokens.add(n.toLowerCase());
    for (const part of n.toLowerCase().split("-")) {
      if (part) tokens.add(part);
    }
  }
  return Array.from(tokens);
}

export const ALL_LUCIDE_ICONS: LucideIconEntry[] = Array.from(byFile.values())
  .map(({ canonical, aliases, loader }) => ({
    name: canonical,
    aliases,
    searchTokens: tokensFor(canonical, aliases),
    loader,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const BY_NAME = new Map<string, LucideIconEntry>();
for (const entry of ALL_LUCIDE_ICONS) {
  BY_NAME.set(entry.name, entry);
  for (const alias of entry.aliases) BY_NAME.set(alias, entry);
}

/** True if `name` resolves to a known Lucide icon (canonical or alias). */
export function isLucideIconName(name: string | null | undefined): boolean {
  return !!name && BY_NAME.has(name);
}

/** Resolves an alias/canonical name to its canonical kebab name. */
export function canonicalizeLucideName(name: string | null | undefined): string | null {
  if (!name) return null;
  return BY_NAME.get(name)?.name ?? null;
}

/** Returns the loader for an icon (or null if not found). */
export function loaderFor(name: string): IconLoader | null {
  return BY_NAME.get(name)?.loader ?? null;
}
