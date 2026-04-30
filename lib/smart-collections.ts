import type { Bookmark, FilterCondition, FilterGroup } from "./types";

/**
 * Parse a relative or absolute date value.
 *   "now-90d"  → Date 90 days ago
 *   "now-30d"  → Date 30 days ago
 *   "now-7d"   → Date 7 days ago
 *   "now-1y"   → Date 1 year ago
 *   ISO 8601    → parsed as-is
 */
export function resolveDateValue(value: string): Date | null {
  if (!value) return null;

  const rel = /^now-(\d+)([dy])$/.exec(value.trim());
  if (rel) {
    const num = parseInt(rel[1], 10);
    const unit = rel[2];
    const ms = unit === "d" ? num * 86_400_000 : num * 365.25 * 86_400_000;
    return new Date(Date.now() - ms);
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function matchesString(
  actual: string,
  operator: FilterCondition["operator"],
  want: string
): boolean {
  const a = actual.toLowerCase();
  const w = want.toLowerCase();
  switch (operator) {
    case "contains":
      return a.includes(w);
    case "not_contains":
      return !a.includes(w);
    case "equals":
      return a === w;
    case "starts_with":
      return a.startsWith(w);
    default:
      return false;
  }
}

function matchesTags(
  tags: string[],
  operator: FilterCondition["operator"],
  want: string[]
): boolean {
  const wantArr = Array.isArray(want) ? want.map((t) => t.toLowerCase()) : [];
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  // "contains" = bookmark has ALL requested tags (AND within the array)
  // "not_contains" = bookmark has NONE of the requested tags
  if (operator === "contains") {
    return wantArr.every((t) => tagSet.has(t));
  }
  if (operator === "not_contains") {
    return wantArr.every((t) => !tagSet.has(t));
  }
  return false;
}

function matchesDate(
  actual: string | null | undefined,
  operator: FilterCondition["operator"],
  value: string
): boolean {
  if (!actual) return false;
  const a = new Date(actual);
  if (isNaN(a.getTime())) return false;
  const ref = resolveDateValue(value);
  if (!ref) return false;

  const aTime = a.getTime();
  const refTime = ref.getTime();
  switch (operator) {
    case "after":
      return aTime > refTime;
    case "before":
      return aTime < refTime;
    default:
      return false;
  }
}

export function evaluateCondition(
  bookmark: Bookmark,
  condition: FilterCondition
): boolean {
  const { property, operator, value } = condition;

  switch (property) {
    case "tags": {
      const want = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? [value]
          : [];
      return matchesTags(bookmark.tags ?? [], operator, want);
    }

    case "title": {
      const title = bookmark.title ?? "";
      return matchesString(title, operator, String(value));
    }

    case "url": {
      return matchesString(bookmark.url, operator, String(value));
    }

    case "domain": {
      return matchesString(domainOf(bookmark.url), operator, String(value));
    }

    case "created_at": {
      return matchesDate(bookmark.created_at, operator, String(value));
    }

    case "pinned": {
      if (operator === "equals") {
        return bookmark.pinned === Boolean(value);
      }
      return false;
    }

    default:
      return false;
  }
}

export function evaluateFilter(
  bookmark: Bookmark,
  filter: FilterGroup
): boolean {
  const clauses: ((FilterCondition | FilterGroup) & { kind?: string })[] = [];

  if (filter.and) {
    return filter.and.every((clause) => {
      if ("property" in clause) {
        return evaluateCondition(bookmark, clause as FilterCondition);
      }
      return evaluateFilter(bookmark, clause as FilterGroup);
    });
  }

  if (filter.or) {
    return filter.or.some((clause) => {
      if ("property" in clause) {
        return evaluateCondition(bookmark, clause as FilterCondition);
      }
      return evaluateFilter(bookmark, clause as FilterGroup);
    });
  }

  // Empty filter matches nothing.
  return false;
}

export function filterBookmarks(
  bookmarks: Bookmark[],
  filter: FilterGroup
): Bookmark[] {
  return bookmarks.filter((b) => evaluateFilter(b, filter));
}

const VALID_PROPERTIES = new Set<string>([
  "tags",
  "title",
  "url",
  "domain",
  "created_at",
  "pinned",
]);

const VALID_OPERATORS_BY_PROPERTY: Record<string, Set<string>> = {
  tags: new Set(["contains", "not_contains"]),
  title: new Set(["contains", "not_contains", "starts_with", "equals"]),
  url: new Set(["contains", "not_contains", "starts_with", "equals"]),
  domain: new Set(["contains", "not_contains", "starts_with", "equals"]),
  created_at: new Set(["after", "before"]),
  pinned: new Set(["equals"]),
};

function validateCondition(c: unknown, depth: number): string | null {
  if (!c || typeof c !== "object") return "Condition must be an object.";
  const cond = c as Record<string, unknown>;

  if (!VALID_PROPERTIES.has(String(cond.property ?? "")))
    return `Invalid property: ${String(cond.property)}`;

  const validOps = VALID_OPERATORS_BY_PROPERTY[String(cond.property)];
  if (!validOps?.has(String(cond.operator ?? "")))
    return `Invalid operator "${String(cond.operator)}" for property "${String(cond.property)}"`;

  if (cond.value === undefined || cond.value === null)
    return `Missing value for condition on "${String(cond.property)}"`;

  // Type-check the value.
  const prop = String(cond.property);
  if (prop === "tags") {
    if (!Array.isArray(cond.value) || !cond.value.every((v) => typeof v === "string"))
      return "Value for 'tags' must be a string array.";
  } else if (prop === "pinned") {
    if (typeof cond.value !== "boolean")
      return "Value for 'pinned' must be a boolean.";
  } else {
    if (typeof cond.value !== "string")
      return `Value for "${prop}" must be a string.`;
  }

  return null;
}

export function validateFilter(
  filter: unknown,
  maxDepth = 3
): { valid: boolean; error?: string } {
  if (!filter || typeof filter !== "object")
    return { valid: false, error: "Filter must be an object." };

  const f = filter as Record<string, unknown>;
  const groupType = f.and ? "and" : f.or ? "or" : null;
  if (!groupType)
    return { valid: false, error: "Filter must have 'and' or 'or' at the top level." };

  const clauses = Array.isArray(f[groupType]) ? f[groupType] : null;
  if (!clauses)
    return { valid: false, error: `"${groupType}" must be an array.` };
  if (clauses.length === 0)
    return { valid: false, error: "Filter must have at least one condition." };

  return validateGroup(clauses, 1, maxDepth);
}

function validateGroup(
  clauses: unknown[],
  depth: number,
  maxDepth: number
): { valid: boolean; error?: string } {
  if (depth > maxDepth)
    return { valid: false, error: `Filter depth exceeds max of ${maxDepth}.` };

  for (const clause of clauses) {
    if (!clause || typeof clause !== "object")
      return { valid: false, error: "Each clause must be an object." };

    const c = clause as Record<string, unknown>;
    if (c.property !== undefined) {
      // It's a condition.
      const err = validateCondition(c, depth);
      if (err) return { valid: false, error: err };
    } else if (c.and !== undefined || c.or !== undefined) {
      // It's a nested group.
      const groupKey = c.and ? "and" : "or";
      const nested = c[groupKey];
      if (!Array.isArray(nested))
        return { valid: false, error: `"${groupKey}" must be an array.` };
      const result = validateGroup(nested, depth + 1, maxDepth);
      if (!result.valid) return result;
    } else {
      return {
        valid: false,
        error: "Each clause must have 'property' (a condition) or 'and'/'or' (a nested group).",
      };
    }
  }

  return { valid: true };
}
