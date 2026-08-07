"use client";

import { useEffect } from "react";

/**
 * Pointer-driven visual effects, mounted once for the whole app.
 *
 * Two effects, one listener:
 *   [data-spotlight]  a soft radial light tracks the cursor inside the element
 *   [data-magnetic]   the element drifts a few pixels toward the cursor
 *
 * Deliberately delegated rather than per-component: server components can opt
 * in with a plain HTML attribute, and the page pays for exactly one
 * `pointermove` handler no matter how many cards are on screen. Writes are
 * batched into a single rAF and go to CSS custom properties, so nothing here
 * triggers a React render or a layout read during paint.
 *
 * Disabled entirely for coarse pointers (touch — where there is no hover) and
 * for `prefers-reduced-motion`.
 */

const MAGNET_RADIUS = 90; // px beyond the element's box where the pull begins
const MAGNET_STRENGTH = 0.28; // fraction of the cursor offset the element travels
const MAGNET_MAX = 11; // px cap, so buttons never detach from their layout slot

export function PointerFX() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;

    let frame = 0;
    let lastX = 0;
    let lastY = 0;
    // Elements currently displaced, so they can be released when the cursor leaves.
    const pulled = new Set<HTMLElement>();

    const apply = () => {
      frame = 0;

      // Spotlight: only the card under the cursor needs updating.
      const under = document.elementFromPoint(lastX, lastY);
      const card = under instanceof Element ? under.closest<HTMLElement>("[data-spotlight]") : null;
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--spot-x", `${lastX - r.left}px`);
        card.style.setProperty("--spot-y", `${lastY - r.top}px`);
        card.style.setProperty("--spot-on", "1");
        if (card.dataset.spotActive !== "1") {
          card.dataset.spotActive = "1";
        }
      }
      document.querySelectorAll<HTMLElement>('[data-spot-active="1"]').forEach((el) => {
        if (el !== card) {
          el.style.setProperty("--spot-on", "0");
          delete el.dataset.spotActive;
        }
      });

      // Magnetic: pull anything whose box the cursor is near.
      document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const near =
          lastX > r.left - MAGNET_RADIUS &&
          lastX < r.right + MAGNET_RADIUS &&
          lastY > r.top - MAGNET_RADIUS &&
          lastY < r.bottom + MAGNET_RADIUS;

        if (near) {
          const dx = clamp((lastX - cx) * MAGNET_STRENGTH, MAGNET_MAX);
          const dy = clamp((lastY - cy) * MAGNET_STRENGTH, MAGNET_MAX);
          el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
          pulled.add(el);
        } else if (pulled.has(el)) {
          el.style.transform = "";
          pulled.delete(el);
        }
      });
    };

    const onMove = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const release = () => {
      pulled.forEach((el) => {
        el.style.transform = "";
      });
      pulled.clear();
      document.querySelectorAll<HTMLElement>('[data-spot-active="1"]').forEach((el) => {
        el.style.setProperty("--spot-on", "0");
        delete el.dataset.spotActive;
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("blur", release);
    document.addEventListener("pointerleave", release);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", release);
      document.removeEventListener("pointerleave", release);
      release();
    };
  }, []);

  return null;
}

function clamp(v: number, max: number) {
  return Math.max(-max, Math.min(max, v));
}
