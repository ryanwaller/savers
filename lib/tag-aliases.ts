import type { TagAlias } from "./types";

/** Clean and normalize a single raw tag string. */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/^[#\s]+|[\s#]+$/g, "")
    .replace(/-based$/, "") // "london-based" → "london"
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2 || cleaned.length > 30) return null;
  if (/[<>]/.test(cleaned)) return null;
  return cleaned;
}

/** Split a raw tag on commas and normalize each part. Returns flat array of valid tags. */
export function normalizeTagList(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  // If the LLM returns "london, united kingdom", split into separate tags
  return raw
    .split(",")
    .map((part) => normalizeTag(part))
    .filter((t): t is string => Boolean(t));
}

/**
 * Map tags through the alias table, replacing known variants with their
 * canonical form. Tags without a match pass through unchanged.
 */
export function resolveAliases(
  tags: string[],
  aliases: TagAlias[],
): string[] {
  const variantMap = new Map<string, string>();
  for (const a of aliases) {
    for (const v of a.variants) {
      variantMap.set(v.toLowerCase(), a.canonical_tag);
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const canonical = variantMap.get(tag.toLowerCase()) ?? tag;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

/** Seed aliases — shipped as code so they survive DB resets. */
export const SEED_ALIASES: { canonical_tag: string; variants: string[] }[] = [
  // Design disciplines
  { canonical_tag: "typography", variants: ["type design", "typeface", "fonts", "type", "font design"] },
  { canonical_tag: "graphic design", variants: ["graphic", "visual design", "communication design"] },
  { canonical_tag: "motion design", variants: ["motion graphics", "motion", "animation", "mograph"] },
  { canonical_tag: "interaction design", variants: ["ixd", "ui design", "interaction"] },
  { canonical_tag: "product design", variants: ["ux design", "ux", "digital product", "product"] },
  { canonical_tag: "branding", variants: ["brand identity", "brand design", "visual identity", "identity design", "logo design", "logos"] },
  { canonical_tag: "illustration", variants: ["illustrator", "drawing", "digital art"] },
  { canonical_tag: "web design", variants: ["web", "website design", "web development", "front-end", "frontend"] },
  { canonical_tag: "print design", variants: ["print", "editorial", "publication design", "book design"] },
  { canonical_tag: "photography", variants: ["photographer", "photo"] },

  // Locations — city name is canonical. Country is added via enrichWithCountries.
  { canonical_tag: "new york", variants: ["nyc", "new york city", "brooklyn", "manhattan", "new york-based"] },
  { canonical_tag: "los angeles", variants: ["la", "los angeles ca", "los angeles-based"] },
  { canonical_tag: "san francisco", variants: ["sf", "san francisco ca", "bay area", "san francisco-based"] },
  { canonical_tag: "london", variants: ["london uk", "london-based"] },
  { canonical_tag: "berlin", variants: ["berlin germany", "berlin-based"] },
  { canonical_tag: "amsterdam", variants: ["amsterdam netherlands", "amsterdam-based"] },
  { canonical_tag: "paris", variants: ["paris france", "paris-based"] },
  { canonical_tag: "tokyo", variants: ["tokyo japan", "tokyo-based"] },
  { canonical_tag: "melbourne", variants: ["melbourne australia", "melbourne-based"] },
  { canonical_tag: "stockholm", variants: ["stockholm sweden", "stockholm-based"] },

  // Techniques/mediums
  { canonical_tag: "risograph", variants: ["riso", "riso print"] },
  { canonical_tag: "letterpress", variants: ["letter press"] },
  { canonical_tag: "screen printing", variants: ["screenprint", "silkscreen"] },
  { canonical_tag: "generative", variants: ["generative art", "generative design", "creative coding"] },
  { canonical_tag: "variable fonts", variants: ["variable type", "variable typography"] },
  { canonical_tag: "brutalist", variants: ["brutalism", "brutalist design"] },
  { canonical_tag: "minimalist", variants: ["minimal", "minimalism", "minimal design"] },
];

/** Map known cities to their country — used to enrich auto-tags. */
export const CITY_COUNTRY_MAP: Record<string, string> = {
  "new york": "united states",
  "los angeles": "united states",
  "san francisco": "united states",
  london: "united kingdom",
  berlin: "germany",
  amsterdam: "netherlands",
  paris: "france",
  tokyo: "japan",
  melbourne: "australia",
  stockholm: "sweden",
};

/**
 * Given a list of tags, add the corresponding country for any recognized city
 * that doesn't already have its country in the list.
 */
export function enrichWithCountries(tags: string[]): string[] {
  const out = [...tags];
  for (const tag of tags) {
    const country = CITY_COUNTRY_MAP[tag];
    if (country && !out.includes(country)) {
      out.push(country);
    }
  }
  return out;
}
