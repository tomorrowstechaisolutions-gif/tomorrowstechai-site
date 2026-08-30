"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the sidebar is collapsed to icons.
 *
 * Backed by localStorage through useSyncExternalStore rather than an effect
 * that reads storage and calls setState. That pattern causes a cascading
 * render and, worse, a hydration mismatch — the server has no idea what the
 * browser stored. useSyncExternalStore is built for exactly this: the server
 * snapshot is "expanded", and React reconciles to the stored value.
 */

const KEY = "ttai:admin-nav-collapsed";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  // Another tab collapsing its sidebar should collapse this one too.
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private mode, or storage blocked. Expanded is the safe default.
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

export function useCollapsed(): [boolean, (value: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = (value: boolean) => {
    try {
      window.localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      // Not persisting is survivable; not toggling is not.
    }
    for (const listener of listeners) listener();
  };

  return [collapsed, set];
}
