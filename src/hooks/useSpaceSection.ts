import { useCallback, useEffect, useState } from "react";
import type { SpaceKey } from "@/lib/spaces";

/** Restore only navigation state, independently for each account and browser tab. */
export function useSpaceSection<T extends string>(space: SpaceKey, userId: string, initial: T, sections: readonly T[]) {
  const key = `navigation:section:${space}:${userId}`;
  const [state, setState] = useState({ key: "", section: initial });
  const allowed = sections.join("|");

  useEffect(() => {
    let section = initial;
    try {
      const saved = sessionStorage.getItem(key);
      const match = allowed.split("|").find((value) => value === saved);
      if (match) section = match as T;
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
    setState({ key, section });
  }, [key, initial, allowed]);

  const select = useCallback((section: T) => {
    setState({ key, section });
    try {
      sessionStorage.setItem(key, section);
    } catch {
      // Keep the current section in memory in restricted browsers.
    }
  }, [key]);

  return [state.key === key ? state.section : initial, select, state.key === key] as const;
}