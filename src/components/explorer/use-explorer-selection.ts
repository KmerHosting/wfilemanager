import { useCallback, useMemo, useState, type MouseEvent } from "react";
import type { LocalFileEntry } from "@/lib/local-api";

export function useExplorerSelection(entries: LocalFileEntry[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selected.has(entry.path)),
    [entries, selected],
  );

  const selectOnly = useCallback((entry: LocalFileEntry) => {
    setSelected(new Set([entry.path]));
    setAnchorPath(entry.path);
    setFocusedPath(entry.path);
  }, []);

  const selectEntry = useCallback(
    (entry: LocalFileEntry, event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">) => {
      const additive = event.ctrlKey || event.metaKey;
      if (event.shiftKey && anchorPath) {
        const anchorIndex = entries.findIndex((candidate) => candidate.path === anchorPath);
        const entryIndex = entries.findIndex((candidate) => candidate.path === entry.path);
        if (anchorIndex >= 0 && entryIndex >= 0) {
          const range = entries
            .slice(Math.min(anchorIndex, entryIndex), Math.max(anchorIndex, entryIndex) + 1)
            .map((candidate) => candidate.path);
          setSelected((current) => new Set(additive ? [...current, ...range] : range));
        }
      } else if (additive) {
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(entry.path)) next.delete(entry.path);
          else next.add(entry.path);
          return next;
        });
        setAnchorPath(entry.path);
      } else {
        selectOnly(entry);
      }
      setFocusedPath(entry.path);
    },
    [anchorPath, entries, selectOnly],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchorPath(null);
    setFocusedPath(null);
  }, []);

  return {
    selected,
    setSelected,
    selectedEntries,
    anchorPath,
    focusedPath,
    selectOnly,
    selectEntry,
    clearSelection,
  };
}
