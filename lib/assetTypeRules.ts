export type AssetType =
  | "recipe_hero"
  | "product_inset"
  | "text_excerpt"
  | "screenshot";

export const RECIPE_TAGS = ["recipe", "cooking", "food", "baking"];
export const SHOPPING_COLLECTION_KEYWORDS = ["shopping", "shop", "store", "products", "buy"];
export const SHOPPING_TAGS = ["shopping", "shop", "store", "products", "product", "buy"];
export const ARTICLE_TAGS = ["essay", "article"];

const PRODUCT_DETAIL_PATTERNS = [
  /\/products?\//i,
  /\/p\//i,
  /\/item\//i,
  /\/shop\/buy[-/]/i,
  /\/buy-watch\//i,
  /[?&]variant=/i,
];

const NON_DETAIL_PATTERNS = [
  /\/collections\/[^/?#]+\/?$/i,
  /\/categories?\//i,
  /\/search(?:[/?#]|$)/i,
  /[?&](q|query|search)=/i,
];

function normalizePath(collectionPath: string) {
  return collectionPath.toLowerCase();
}

function normalizeTags(tags: string[]) {
  return tags.map((t) => t.toLowerCase());
}

export function isRecipeContext(collectionPath: string, tags: string[]) {
  const path = normalizePath(collectionPath);
  const lower = normalizeTags(tags);
  return path.includes("recipes") || lower.some((t) => RECIPE_TAGS.includes(t));
}

export function isShoppingContext(collectionPath: string, tags: string[]) {
  const path = normalizePath(collectionPath);
  const lower = normalizeTags(tags);
  const isShoppingCollection = SHOPPING_COLLECTION_KEYWORDS.some((keyword) =>
    path.includes(keyword)
  );
  const isShoppingTag = lower.some((t) => SHOPPING_TAGS.includes(t));
  return isShoppingCollection || isShoppingTag;
}

export function isArticleContext(collectionPath: string, tags: string[]) {
  const path = normalizePath(collectionPath);
  const lower = normalizeTags(tags);
  return path.includes("read later") || lower.some((t) => ARTICLE_TAGS.includes(t));
}

export function looksLikeProductDetailUrl(url: string) {
  const value = url.toLowerCase();
  if (PRODUCT_DETAIL_PATTERNS.some((pattern) => pattern.test(value))) {
    return true;
  }
  if (NON_DETAIL_PATTERNS.some((pattern) => pattern.test(value))) {
    return false;
  }
  return false;
}

/**
 * Determine the expected asset type from a collection path and bookmark tags.
 * Must mirror the worker's qualification logic exactly (workers/screenshot-worker.ts
 * processJob, lines ~64-119).
 *
 * Priority: recipe > shopping > article > screenshot
 */
export function determineAssetType(
  collectionPath: string,
  tags: string[],
): AssetType {
  if (isRecipeContext(collectionPath, tags)) return "recipe_hero";
  if (isShoppingContext(collectionPath, tags)) return "product_inset";
  if (isArticleContext(collectionPath, tags)) return "text_excerpt";

  return "screenshot";
}

/**
 * Build a hierarchical collection path by walking the parent_id chain.
 * Returns a lowercased " / "-separated path, or "" for null/unsorted.
 */
export function buildCollectionPath(
  collectionId: string | null,
  byId: Map<
    string,
    { id: string; name: string; parent_id: string | null }
  >,
): string {
  if (!collectionId) return "";

  const parts: string[] = [];
  let cur = byId.get(collectionId);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return parts.join(" / ").toLowerCase();
}
