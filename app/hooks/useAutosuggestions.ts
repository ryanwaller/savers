import { useState, type SetStateAction } from "react";

/** Keeps keyboard selection tied to the text that produced a suggestion list. */
export function useAutosuggestions<T>(query: string, matches: T[], initialIndex: number) {
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ query: string; index: number } | null>(null);
  const suggestions = dismissedQuery === query ? [] : matches;
  const selectedIndex = selection?.query === query && selection.index < suggestions.length
    ? selection.index
    : suggestions.length > 0 ? initialIndex : -1;

  const setSelectedIndex = (next: SetStateAction<number>) => {
    setSelection({ query, index: typeof next === "function" ? next(selectedIndex) : next });
  };

  return {
    suggestions,
    selectedIndex,
    setSelectedIndex,
    dismiss: () => setDismissedQuery(query),
    reveal: () => setDismissedQuery(null),
  };
}
