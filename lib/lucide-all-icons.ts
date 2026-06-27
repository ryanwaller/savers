/**
 * Full Lucide catalog, lazy-loaded.
 *
 * The catalog itself (1,700+ canonical icons + their aliases) is generated at
 * dev time into `lucide-icon-list.generated.ts` — see the comment in
 * `scripts/build-lucide-icon-list.mjs` for why we don't compute the list at
 * runtime. Loaders are looked up here against `dynamicIconImports`, so each
 * icon's module is only fetched the first time its cell scrolls into view.
 */

import dynamicIconImports from "lucide-react/dynamicIconImports";
import type { LucideIcon } from "lucide-react";
import { LUCIDE_ICON_NAMES } from "./lucide-icon-list.generated";

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

const loaderMap = dynamicIconImports as Record<string, IconLoader>;

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

export const ALL_LUCIDE_ICONS: LucideIconEntry[] = LUCIDE_ICON_NAMES.flatMap(
  ({ name, aliases }) => {
    const loader = loaderMap[name];
    // Defensive: a name in the generated list that isn't in the runtime
    // dynamicIconImports map would mean lucide-react was upgraded without
    // regenerating the list. Skip it rather than render a broken cell.
    if (!loader) return [];
    return [{
      name,
      aliases,
      searchTokens: tokensFor(name, aliases),
      loader,
    }];
  },
);

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
