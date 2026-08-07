"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Reads the user's motion preference as an external store rather than syncing
 * it into state from an effect — that pattern causes a cascading render on
 * mount and React now lints against it. Server snapshot is `false` so SSR and
 * the first client render agree; if the user does prefer reduced motion, React
 * corrects it in the same commit rather than after a paint.
 */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
