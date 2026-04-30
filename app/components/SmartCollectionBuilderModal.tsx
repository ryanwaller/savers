"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Funnel } from "@phosphor-icons/react";
import type { SmartCollection, FilterGroup, FilterCondition, FilterProperty, FilterOperator } from "@/lib/types";
import { api } from "@/lib/api";
import CollectionIcon from "./CollectionIcon";
import IconPicker from "./IconPicker";

const PROPERTIES: { value: FilterProperty; label: string }[] = [
  { value: "tags", label: "Tags" },
  { value: "title", label: "Title" },
  { value: "url", label: "URL" },
  { value: "domain", label: "Domain" },
  { value: "created_at", label: "Created" },
  { value: "pinned", label: "Pinned" },
];

const OPERATORS_BY_PROPERTY: Record<FilterProperty, { value: FilterOperator; label: string }[]> = {
  tags: [
    { value: "contains", label: "has all" },
    { value: "not_contains", label: "has none of" },
  ],
  title: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "starts_with", label: "starts with" },
    { value: "equals", label: "equals" },
  ],
  url: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "starts_with", label: "starts with" },
    { value: "equals", label: "equals" },
  ],
  domain: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "starts_with", label: "starts with" },
    { value: "equals", label: "equals" },
  ],
  created_at: [
    { value: "after", label: "after" },
    { value: "before", label: "before" },
  ],
  pinned: [
    { value: "equals", label: "is" },
  ],
};

const DATE_PRESETS = [
  { label: "Today", value: "now-1d" },
  { label: "7 days", value: "now-7d" },
  { label: "30 days", value: "now-30d" },
  { label: "90 days", value: "now-90d" },
  { label: "1 year", value: "now-1y" },
];

type ConditionRow = {
  property: FilterProperty;
  operator: FilterOperator;
  value: string | string[] | boolean;
};

function defaultCondition(): ConditionRow {
  return { property: "tags", operator: "contains", value: [] };
}

function defaultFilter(): { groupOp: "and" | "or"; conditions: ConditionRow[] } {
  return { groupOp: "and", conditions: [defaultCondition()] };
}

function toFilterGroup(state: { groupOp: "and" | "or"; conditions: ConditionRow[] }): FilterGroup {
  const clauses: (FilterCondition | FilterGroup)[] = state.conditions.map((c) => {
    // Type-safe value conversion
    if (c.property === "tags") {
      return {
        property: c.property,
        operator: c.operator,
        value: Array.isArray(c.value) ? c.value : [],
      } as FilterCondition;
    }
    if (c.property === "pinned") {
      return {
        property: c.property,
        operator: c.operator,
        value: Boolean(c.value),
      } as FilterCondition;
    }
    return {
      property: c.property,
      operator: c.operator,
      value: String(c.value ?? ""),
    } as FilterCondition;
  });

  return state.groupOp === "and" ? { and: clauses } : { or: clauses };
}

function fromFilterGroup(filter: FilterGroup): { groupOp: "and" | "or"; conditions: ConditionRow[] } | null {
  const clauses = filter.and ?? filter.or;
  if (!clauses) return null;
  const groupOp: "and" | "or" = filter.and ? "and" : "or";

  const conditions: ConditionRow[] = [];
  for (const clause of clauses) {
    if ("property" in clause) {
      conditions.push({
        property: clause.property,
        operator: clause.operator,
        value: clause.value,
      });
    }
    // Skip nested groups for MVP
  }

  return { groupOp, conditions: conditions.length > 0 ? conditions : [defaultCondition()] };
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (sc: SmartCollection) => void;
  onUpdated?: (sc: SmartCollection) => void;
  editSmartCollection?: SmartCollection | null;
};

export default function SmartCollectionBuilderModal({
  open,
  onClose,
  onCreated,
  onUpdated,
  editSmartCollection,
}: Props) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [groupOp, setGroupOp] = useState<"and" | "or">("and");
  const [conditions, setConditions] = useState<ConditionRow[]>([defaultCondition()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSample, setPreviewSample] = useState<{ id: string; title: string | null; url: string; tags: string[] }[]>([]);
  const previewTimerRef = useRef<number | null>(null);

  const isEdit = editSmartCollection !== null && editSmartCollection !== undefined;

  // Reset form when opened
  useEffect(() => {
    if (!open) return;
    setError(null);
    setPreviewCount(null);
    setPreviewSample([]);

    if (editSmartCollection) {
      setName(editSmartCollection.name);
      setIcon(editSmartCollection.icon);
      const parsed = fromFilterGroup(editSmartCollection.query_json);
      if (parsed) {
        setGroupOp(parsed.groupOp);
        setConditions(parsed.conditions);
      } else {
        setGroupOp("and");
        setConditions([defaultCondition()]);
      }
    } else {
      setName("");
      setIcon(null);
      setGroupOp("and");
      setConditions([defaultCondition()]);
    }
  }, [open, editSmartCollection]);

  const runPreview = useCallback(() => {
    const filter = toFilterGroup({ groupOp, conditions });
    api
      .previewSmartCollection(filter)
      .then(({ count, sample }) => {
        setPreviewCount(count);
        setPreviewSample(sample);
      })
      .catch(() => {
        // Silently ignore preview errors
      });
  }, [groupOp, conditions]);

  // Debounced preview
  useEffect(() => {
    if (!open) return;
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(runPreview, 500);
    return () => {
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    };
  }, [open, runPreview]);

  if (!open) return null;

  function setCondition(index: number, patch: Partial<ConditionRow>) {
    setConditions((prev) => {
      const next = [...prev];
      const current = { ...next[index] };
      Object.assign(current, patch);

      // Reset operator when property changes
      if (patch.property && patch.property !== next[index].property) {
        const validOps = OPERATORS_BY_PROPERTY[patch.property];
        current.operator = validOps[0].value;

        // Reset value for new property type
        if (patch.property === "tags") current.value = [];
        else if (patch.property === "pinned") current.value = true;
        else current.value = "";
      }

      next[index] = current;
      return next;
    });
  }

  function addCondition() {
    setConditions((prev) => [...prev, defaultCondition()]);
  }

  function removeCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (conditions.length === 0) {
      setError("Add at least one condition.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const query_json = toFilterGroup({ groupOp, conditions });

      if (isEdit && editSmartCollection) {
        const { smart_collection } = await api.updateSmartCollection(editSmartCollection.id, {
          name: name.trim(),
          icon,
          query_json,
        });
        onUpdated?.(smart_collection);
      } else {
        const { smart_collection } = await api.createSmartCollection({
          name: name.trim(),
          icon,
          query_json,
        });
        onCreated?.(smart_collection);
      }

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function renderValueInput(condition: ConditionRow, index: number) {
    if (condition.property === "tags") {
      const tags = Array.isArray(condition.value) ? condition.value : [];
      return <TagValueInput tags={tags} onChange={(tags) => setCondition(index, { value: tags })} />;
    }

    if (condition.property === "pinned") {
      return (
        <button
          type="button"
          className={`boolean-toggle ${condition.value ? "on" : ""}`}
          onClick={() => setCondition(index, { value: !condition.value })}
        >
          {condition.value ? "Yes" : "No"}
        </button>
      );
    }

    if (condition.property === "created_at") {
      return (
        <div className="date-input-row">
          <input
            className="value-input"
            placeholder="now-30d or ISO date"
            value={typeof condition.value === "string" ? condition.value : ""}
            onChange={(e) => setCondition(index, { value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
          <div className="date-presets">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`date-preset ${condition.value === p.value ? "active" : ""}`}
                onClick={() => setCondition(index, { value: p.value })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Text input for title, url, domain
    return (
      <input
        className="value-input"
        placeholder="Value…"
        value={typeof condition.value === "string" ? condition.value : ""}
        onChange={(e) => setCondition(index, { value: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
      />
    );
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div className="title">
            <Funnel size={14} />
            <span>{isEdit ? "Edit smart collection" : "New smart collection"}</span>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="body">
          {/* Name + Icon */}
          <div className="name-row">
            <button
              className="icon-btn"
              onClick={() => setShowIconPicker(!showIconPicker)}
              title="Choose icon"
            >
              <CollectionIcon name={icon} size={16} />
            </button>
            {showIconPicker && (
              <div className="icon-picker-wrap">
                <div className="icon-picker-backdrop" onClick={() => setShowIconPicker(false)} />
                <div className="icon-picker-popup">
                  <IconPicker
                    value={icon}
                    onPick={(name) => {
                      setIcon(name);
                      setShowIconPicker(false);
                    }}
                    onClose={() => setShowIconPicker(false)}
                  />
                </div>
              </div>
            )}
            <input
              className="name-input"
              placeholder="Smart collection name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              autoFocus
            />
          </div>

          {/* AND/OR toggle */}
          <div className="group-op-row">
            <span className="group-op-label">Match</span>
            <div className="group-op-toggle">
              <button
                type="button"
                className={`group-op-btn ${groupOp === "and" ? "active" : ""}`}
                onClick={() => setGroupOp("and")}
              >
                ALL
              </button>
              <button
                type="button"
                className={`group-op-btn ${groupOp === "or" ? "active" : ""}`}
                onClick={() => setGroupOp("or")}
              >
                ANY
              </button>
            </div>
            <span className="group-op-sublabel small muted">of these conditions</span>
          </div>

          {/* Conditions */}
          <div className="conditions">
            {conditions.map((cond, i) => (
              <div key={i} className="condition-row">
                <select
                  className="cond-select"
                  value={cond.property}
                  onChange={(e) =>
                    setCondition(i, { property: e.target.value as FilterProperty })
                  }
                >
                  {PROPERTIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <select
                  className="cond-select"
                  value={cond.operator}
                  onChange={(e) =>
                    setCondition(i, { operator: e.target.value as FilterOperator })
                  }
                >
                  {OPERATORS_BY_PROPERTY[cond.property].map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>

                <div className="cond-value-wrap">{renderValueInput(cond, i)}</div>

                {conditions.length > 1 && (
                  <button
                    className="cond-remove"
                    onClick={() => removeCondition(i)}
                    aria-label="Remove condition"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button className="add-cond-btn" onClick={addCondition}>
            + Add condition
          </button>

          {/* Live preview */}
          {previewCount !== null && (
            <div className="preview-hint">
              {previewCount === 0
                ? "No bookmarks match"
                : `${previewCount} ${previewCount === 1 ? "bookmark matches" : "bookmarks match"}`}
            </div>
          )}

          {error && <div className="error small">{error}</div>}
        </div>

        <div className="foot">
          <div className="foot-left">
            {previewCount !== null && (
              <span className="preview-hint">{previewCount === 0
                ? "No bookmarks match"
                : `${previewCount} ${previewCount === 1 ? "bookmark matches" : "bookmarks match"}`
              }</span>
            )}
          </div>
          <div className="foot-right">
            <button className="cancel-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="save-btn" onClick={save} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create smart collection"}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.32);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 65;
          padding: 24px;
        }
        .panel {
          width: 560px;
          max-width: 100%;
          max-height: 86vh;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--color-border);
        }
        .title {
          font-weight: 600;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .close {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding-bottom: 2px;
        }
        .close:hover {
          border-color: var(--color-border-strong);
          color: var(--color-text);
        }
        .body {
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
          flex: 1 1 auto;
          min-height: 0;
        }
        .name-row {
          display: flex;
          align-items: center;
          gap: 8px;
          position: relative;
        }
        .icon-btn {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text-muted);
          cursor: pointer;
          flex-shrink: 0;
        }
        .icon-btn:hover {
          border-color: var(--color-border-strong);
          color: var(--color-text);
        }
        .icon-picker-wrap {
          position: absolute;
          top: 44px;
          left: 0;
          z-index: 70;
        }
        .icon-picker-backdrop {
          position: fixed;
          inset: 0;
          z-index: -1;
        }
        .name-input {
          flex: 1;
          height: 36px;
          padding: 0 10px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 14px;
          outline: none;
        }
        .name-input:focus {
          border-color: var(--color-border-strong);
        }
        .group-op-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .group-op-label {
          font-size: 13px;
          color: var(--color-text);
        }
        .group-op-toggle {
          display: inline-flex;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          overflow: hidden;
        }
        .group-op-btn {
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 600;
          border: 0;
          background: var(--color-bg-secondary);
          color: var(--color-text-muted);
          cursor: pointer;
        }
        .group-op-btn.active {
          background: var(--color-text);
          color: var(--color-bg);
        }
        .group-op-sublabel {
          font-size: 12px;
        }
        .conditions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .condition-row {
          display: flex;
          align-items: flex-start;
          gap: 6px;
        }
        .cond-select {
          height: 32px;
          padding: 0 8px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          outline: none;
          cursor: pointer;
        }
        .cond-select:focus {
          border-color: var(--color-border-strong);
        }
        .cond-value-wrap {
          flex: 1;
          min-width: 0;
        }
        .value-input {
          width: 100%;
          height: 32px;
          padding: 0 8px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          outline: none;
          box-sizing: border-box;
        }
        .value-input:focus {
          border-color: var(--color-border-strong);
        }
        .cond-remove {
          width: 28px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: var(--color-text-muted);
          font-size: 16px;
          cursor: pointer;
          flex-shrink: 0;
        }
        .cond-remove:hover {
          border-color: var(--color-border);
          color: #d13030;
        }
        .add-cond-btn {
          align-self: flex-start;
          padding: 4px 10px;
          border: 1px dashed var(--color-border);
          border-radius: 6px;
          background: transparent;
          color: var(--color-text-muted);
          font: inherit;
          font-size: 12px;
          cursor: pointer;
        }
        .add-cond-btn:hover {
          border-color: var(--color-border-strong);
          color: var(--color-text);
        }
        .date-input-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .date-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .date-preset {
          padding: 2px 8px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          color: var(--color-text-muted);
          font: inherit;
          font-size: 11px;
          cursor: pointer;
          white-space: nowrap;
        }
        .date-preset:hover {
          border-color: var(--color-border-strong);
          color: var(--color-text);
        }
        .date-preset.active {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .boolean-toggle {
          height: 32px;
          padding: 0 12px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg-secondary);
          color: var(--color-text-muted);
          font: inherit;
          font-size: 12px;
          cursor: pointer;
        }
        .boolean-toggle.on {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .tag-input-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
          padding: 4px 6px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          min-height: 32px;
        }
        .tag-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          font-size: 12px;
          color: var(--color-text);
        }
        .tag-chip-remove {
          width: 14px;
          height: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-size: 12px;
          color: var(--color-text-muted);
          cursor: pointer;
          background: transparent;
          border: 0;
          padding: 0;
        }
        .tag-chip-remove:hover {
          color: #d13030;
        }
        .tag-chip-input {
          border: 0;
          background: transparent;
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          outline: none;
          min-width: 80px;
          flex: 1;
          padding: 2px 0;
        }
        .preview-hint {
          font-size: 12px;
          font-weight: 400;
          color: #34c759;
        }
        .foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid var(--color-border);
        }
        .foot-left {
          flex: 0 1 auto;
          min-width: 0;
        }
        .foot-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .cancel-btn {
          height: 32px;
          padding: 0 12px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          cursor: pointer;
        }
        .cancel-btn:hover {
          border-color: var(--color-border-strong);
        }
        .save-btn {
          height: 32px;
          padding: 0 14px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: var(--color-text);
          color: var(--color-bg);
          font: inherit;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
        }
        .save-btn:hover:not(:disabled) {
          opacity: 0.88;
        }
        .save-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .small {
          font-size: 12px;
        }
        .muted {
          color: var(--color-text-muted);
        }
        .error {
          color: #d13030;
        }
        @media (max-width: 768px) {
          .backdrop {
            padding: 0;
            align-items: stretch;
          }
          .panel {
            border-radius: 0;
            max-height: 100dvh;
            width: 100%;
            border: 0;
          }
        }
      `}</style>
    </div>
  );
}

function TagValueInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function addTag() {
    const tag = input.trim().toLowerCase();
    if (!tag || tags.includes(tag)) {
      setInput("");
      return;
    }
    onChange([...tags, tag]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="tag-input-wrap">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
          <button
            className="tag-chip-remove"
            onClick={() => removeTag(tag)}
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-chip-input"
        placeholder={tags.length === 0 ? "Add tag, press Enter…" : ""}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
          if (e.key === "Backspace" && !input && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
          }
        }}
      />
      <style jsx>{`
        .tag-input-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
          padding: 4px 6px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          min-height: 32px;
        }
        .tag-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          font-size: 12px;
          color: var(--color-text);
        }
        .tag-chip-remove {
          width: 14px;
          height: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-size: 12px;
          color: var(--color-text-muted);
          cursor: pointer;
          background: transparent;
          border: 0;
          padding: 0;
        }
        .tag-chip-remove:hover {
          color: #d13030;
        }
        .tag-chip-input {
          border: 0;
          background: transparent;
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          outline: none;
          min-width: 80px;
          flex: 1;
          padding: 2px 0;
        }
      `}</style>
    </div>
  );
}
