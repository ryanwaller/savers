import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Avoid rendering portals during SSR and the initial hydration pass. */
export function useClientMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
