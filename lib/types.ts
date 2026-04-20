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
  /** Pinned bookmarks sort first everywhere and populate the virtual "Pinned" collection. */
  pinned: boolean
}

export interface OGData {
  title: string | null
  description: string | null
  og_image: string | null
  favicon: string | null
}

export interface AISuggestion {
  collection_id: string | null
  collection_name?: string | null
  collection_path: string | null
  proposed_collection_name?: string | null
  proposed_parent_collection_id?: string | null
  proposed_parent_collection_path?: string | null
  confidence: 'high' | 'medium' | 'low'
}
