export type AssetType =
  | "recipe_hero"
  | "product_inset"
  | "text_excerpt"
  | "screenshot";

const RECIPE_TAGS = ["recipe", "cooking", "food", "baking"];
const SHOPPING_TAGS = ["shopping", "product", "buy", "store"];
const ARTICLE_TAGS = ["essay", "article"];

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
  const path = collectionPath.toLowerCase();
  const lower = tags.map((t) => t.toLowerCase());

  const isRecipeCollection = path.includes("recipes");
  const isRecipeTag = lower.some((t) => RECIPE_TAGS.includes(t));
  if (isRecipeCollection || isRecipeTag) return "recipe_hero";

  const isShoppingCollection = path.includes("shopping");
  const isShoppingTag = lower.some((t) => SHOPPING_TAGS.includes(t));
  if (isShoppingCollection || isShoppingTag) return "product_inset";

  const isReadLater = path.includes("read later");
  const hasArticleTag = lower.some((t) => ARTICLE_TAGS.includes(t));
  if (isReadLater || hasArticleTag) return "text_excerpt";

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
