export interface Collection {
  id: string
  user_id: string | null
  name: string
  parent_id: string | null
  position: number
  created_at: string
  /** Phosphor icon name (e.g. "Folder", "Briefcase"). Null = default folder glyph. */
  icon: string | null
  children?: Collection[]
  bookmark_count?: number
  /** Public sharing fields (set when the user publishes a collection). */
  is_public?: boolean
  public_id?: string | null
  public_slug?: string | null
  public_description?: string | null
}

export interface Bookmark {
  id: string
  user_id: string | null
  collection_id: string | null
  url: string
  title: string | null
  description: string | null
  og_image: string | null
  favicon: string | null
  tags: string[]
  notes: string | null
  position: number
  created_at: string
  preview_version?: number | null
  preview_path?: string | null
  custom_preview_path?: string | null
  preview_provider?: string | null
  preview_updated_at?: string | null
  /** Async screenshot job status: 'pending' | 'processing' | 'complete' | 'error' */
  screenshot_status?: string | null
  screenshot_error?: string | null
  /** Pinned bookmarks sort first everywhere and populate the virtual "Pinned" collection. */
  pinned: boolean
  /** Async LLM auto-tagging status: 'pending' | 'processing' | 'completed' | 'failed' */
  tagging_status?: string | null
  /** Auto-extracted tags from the LLM pipeline. Never overwritten by user edits. */
  auto_tags?: string[]
  /** 'recipe_hero' for recipe hero crops, 'product_inset' for single-product shopping bookmarks, 'text_excerpt' for read-later/article bookmarks; null/undefined for standard screenshots. */
  asset_type?: string | null
  /** When true, prevents automatic asset type detection from overriding the current preview. */
  asset_override?: boolean
  /** Link health check status: 'unknown' | 'active' | 'broken' | 'redirect' */
  link_status?: string | null
  /** Timestamp of the most recent link health check. */
  last_link_check?: string | null
  /** User verification status for broken links: 'flagged' | 'confirmed_broken' | 'verified_active' | 'false_positive' */
  broken_status?: string | null
  /** When the link was first flagged as broken by the health checker. */
  broken_checked_at?: string | null
  /** When the user verified (confirmed or disputed) the broken link. */
  broken_verified_at?: string | null
  /** Which user verified this broken link. */
  broken_verified_by?: string | null
  /** Public share token (UUID). When set, the bookmark can be viewed at /s/[token] without auth. */
  share_token?: string | null
  /** Source of the bookmark: 'feed' for RSS/Atom imports, null for manual saves. */
  source?: string | null
  /** Feed subscription that created this bookmark. */
  feed_subscription_id?: string | null
}

export interface FeedSubscription {
  id: string
  user_id: string
  feed_url: string
  name: string
  icon: string | null
  collection_id: string | null
  last_checked_at: string | null
  site_url: string | null
  created_at: string
}

export interface FeedItem {
  id: string
  subscription_id: string
  guid: string
  url: string | null
  title: string | null
  description: string | null
  preview_image?: string | null
  published_at: string | null
  bookmark_id: string | null
  imported: boolean
  dismissed: boolean
  created_at: string
}

export interface ImageCollection {
  id: string
  user_id?: string | null
  name: string
  parent_id: string | null
  position?: number
  created_at?: string
  icon?: string | null
  image_count?: number
  is_public?: boolean
  public_id?: string | null
  public_slug?: string | null
  public_description?: string | null
}

export interface TagAlias {
  id: string
  canonical_tag: string
  variants: string[]
  created_at: string
}

export interface OGData {
  title: string | null
  description: string | null
  og_image: string | null
  favicon: string | null
}

// --- Smart Collections ---

export type FilterOperator =
  | 'contains' | 'not_contains' | 'equals'
  | 'starts_with' | 'after' | 'before';

export type FilterProperty =
  | 'tags' | 'title' | 'url' | 'domain' | 'created_at' | 'pinned';

export interface FilterCondition {
  property: FilterProperty;
  operator: FilterOperator;
  value: string | string[] | boolean;
}

export interface FilterGroup {
  and?: (FilterCondition | FilterGroup)[];
  or?: (FilterCondition | FilterGroup)[];
}

export interface SmartCollection {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  query_json: FilterGroup;
  position: number;
  created_at: string;
}

// ---

export interface AISuggestion {
  collection_id: string | null
  collection_name?: string | null
  collection_path: string | null
  proposed_collection_name?: string | null
  proposed_parent_collection_id?: string | null
  proposed_parent_collection_path?: string | null
  confidence: 'high' | 'medium' | 'low'
}

// --- Duplicate Review ---

export interface DuplicateGroupInstance {
  id: string
  title: string | null
  url: string
  collection_id: string | null
  collection_name: string
  created_at: string
  favicon: string | null
}

export interface DuplicateGroup {
  canonicalUrl: string
  displayHost: string
  displayPath: string
  isCrossCollection: boolean
  instances: DuplicateGroupInstance[]
}
