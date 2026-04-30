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
