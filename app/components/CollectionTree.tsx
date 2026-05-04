"use client";
import { useCollectionCollapse } from "@/app/hooks/useCollectionCollapse";

interface Collection {
  id: string;
  name: string;
  count?: number;
  children?: Collection[];
}

interface CollectionTreeProps {
  collections: Collection[];
  onSelect?: (collection: Collection) => void;
}

export function CollectionTree({ collections, onSelect }: CollectionTreeProps) {
  const { isCollapsed, toggle } = useCollectionCollapse();

  return (
    <div className="collection-tree">
      {collections.map((collection) => (
        <CollectionItem
          key={collection.id}
          collection={collection}
          isCollapsed={isCollapsed(collection.id)}
          isCollapsedId={isCollapsed}
          onToggle={() => toggle(collection.id)}
          onToggleId={toggle}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  );
}

interface CollectionItemProps {
  collection: Collection;
  isCollapsed: boolean;
  isCollapsedId: (id: string) => boolean;
  onToggle: () => void;
  onToggleId: (id: string) => void;
  onSelect?: (collection: Collection) => void;
  depth: number;
}

function CollectionItem({
  collection,
  isCollapsed,
  isCollapsedId,
  onToggle,
  onToggleId,
  onSelect,
  depth,
}: CollectionItemProps) {
  const hasChildren = collection.children && collection.children.length > 0;

  return (
    <div className="collection-item" style={{ marginLeft: `${depth * 16}px` }}>
      <div className="collection-header">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) {
              onToggle();
            }
          }}
          className={`toggle-btn ${hasChildren ? 'has-children' : 'no-children'}`}
          aria-expanded={hasChildren ? !isCollapsed : undefined}
          aria-label={hasChildren ? (isCollapsed ? `Expand ${collection.name}` : `Collapse ${collection.name}`) : collection.name}
        >
          {hasChildren ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`chevron ${isCollapsed ? '' : 'rotated'}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          ) : (
            <span className="placeholder" />
          )}
        </button>

        <button
          onClick={() => onSelect?.(collection)}
          className="collection-name"
        >
          <span className="name">{collection.name}</span>
          {collection.count !== undefined && (
            <span className="count">{collection.count}</span>
          )}
        </button>
      </div>

      {/* Render children with animation */}
      {hasChildren && (
        <div
          className={`collection-children ${isCollapsed ? 'collapsed' : 'expanded'}`}
          style={{
            maxHeight: isCollapsed ? '0' : '1000px',
            opacity: isCollapsed ? 0 : 1,
          }}
        >
          {collection.children!.map((child) => (
            <CollectionItem
              key={child.id}
              collection={child}
              isCollapsed={isCollapsedId(child.id)}
              isCollapsedId={isCollapsedId}
              onToggle={() => onToggleId(child.id)}
              onToggleId={onToggleId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        .collection-item {
          margin-bottom: 4px;
        }

        .collection-header {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 8px;
          border-radius: 6px;
          transition: background-color 0.15s ease;
        }

        .collection-header:hover {
          background-color: rgba(0, 0, 0, 0.04);
        }

        .toggle-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          color: #6b7280;
          transition: color 0.15s ease;
        }

        .toggle-btn:hover {
          color: #111827;
        }

        .toggle-btn.no-children {
          cursor: default;
        }

        .chevron {
          transition: transform 0.2s ease;
        }

        .chevron.rotated {
          transform: rotate(90deg);
        }

        .placeholder {
          width: 16px;
          height: 16px;
        }

        .collection-name {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          text-align: left;
          font-size: 14px;
          color: #374151;
          font-weight: 400;
        }

        .collection-name:hover {
          color: #111827;
        }

        .name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .count {
          font-size: 12px;
          color: #9ca3af;
          background: rgba(0, 0, 0, 0.04);
          padding: 2px 8px;
          border-radius: 999px;
          min-width: 24px;
          text-align: center;
        }

        .collection-children {
          overflow: hidden;
          transition: max-height 0.3s ease, opacity 0.2s ease;
        }

        .collection-children.collapsed {
          visibility: hidden;
        }

        .collection-children.expanded {
          visibility: visible;
        }
      `}</style>
    </div>
  );
}
