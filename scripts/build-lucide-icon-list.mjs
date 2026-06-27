#!/usr/bin/env node
/**
 * Generate `lib/lucide-icon-list.generated.ts` from lucide-react's dynamic
 * import map.
 *
 * Why a generator instead of computing this at runtime?
 *   The previous approach called `loader.toString()` on each entry of
 *   `dynamicIconImports` and grepped the path out of the source to dedupe
 *   aliases. That works in Node and dev mode but production bundlers
 *   (webpack/Turbopack) rewrite `import('./icons/foo.mjs')` into ID-based
 *   requires that no longer contain the original path, which collapsed every
 *   entry to the same dedup key and effectively gave the IconPicker only
 *   one extra icon. Pre-computing the list dodges the issue entirely.
 *
 * Run this whenever lucide-react is upgraded:
 *
 *   node scripts/build-lucide-icon-list.mjs
 *
 * (also wired as the `gen:icons` npm script so CI / package-lock changes
 * surface a diff if the list goes stale.)
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const dynModule = await import(
  resolve(REPO_ROOT, "node_modules/lucide-react/dynamicIconImports.mjs")
);
const dyn = dynModule.default ?? dynModule;

// dynamicIconImports maps both canonical kebab names AND aliases to the same
// loader (each lambda contains `import('./icons/<canonical>.mjs')`). We
// dedupe by the underlying canonical file so the picker shows each glyph
// once — the alias names are still kept around as searchable tokens.
const byCanonical = new Map();
for (const [name, loader] of Object.entries(dyn)) {
  const match = loader.toString().match(/icons\/([a-z0-9-]+)\.mjs/);
  if (!match) continue;
  const canonical = match[1];

  const existing = byCanonical.get(canonical);
  if (!existing) {
    byCanonical.set(canonical, { name: canonical, aliases: [] });
  } else if (name !== canonical) {
    existing.aliases.push(name);
  }
}

const list = Array.from(byCanonical.values()).sort((a, b) =>
  a.name.localeCompare(b.name),
);

const header = `// THIS FILE IS GENERATED — do not edit by hand.
// Regenerate via: node scripts/build-lucide-icon-list.mjs
//
// Source: node_modules/lucide-react/dynamicIconImports.mjs (lucide-react)
// Total canonical icons: ${list.length}
//
// Each entry holds the canonical kebab-case name and any alias names that
// resolve to the same icon. \`@/lib/lucide-all-icons\` uses this list as the
// authoritative catalog and looks up the loader at runtime via
// dynamicIconImports[name].

export type LucideIconName = {
  /** Canonical kebab-case name (matches the lucide.dev URL slug). */
  name: string;
  /** Other dynamicIconImports keys that resolve to the same icon module. */
  aliases: string[];
};

export const LUCIDE_ICON_NAMES: LucideIconName[] = ${JSON.stringify(list, null, 2)};
`;

const outPath = resolve(REPO_ROOT, "lib/lucide-icon-list.generated.ts");
writeFileSync(outPath, header);
console.log(`Wrote ${list.length} canonical icons to ${outPath}`);
