"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GUIDE_INVITE_TEXT } from "@/lib/guide/script";
import { inviteDue, INVITE_AFTER_MS, INVITE_KEY } from "@/lib/guide/invite";
import styles from "./guide.module.css";

const TessCore = dynamic(() => import("@/components/admin/cc/tess/TessCore"), { ssr: false });
const still = () => 0;

/**
 * Tess in the corner of the public site. She is always there as a small
 * living globe. Thirteen seconds after a visitor arrives she opens once and
 * offers to help. Either way a click takes them to her page.
 *
 * The small globe is drawn only once the page has gone quiet, so it never
 * competes with the page's own loading. Until then a plain glowing ball
 * holds her place, and stays if the browser cannot draw her at all.
 *
 * The pop-up is silent: a browser will not play sound before a click. The
 * click that opens her page is what lets her speak there.
 */
export function GuideMascot() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [alive, setAlive] = useState(false);

  useEffect(() => {
    const begin = () => setAlive(true);
    // Not every browser has requestIdleCallback; a short wait does the same job.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(begin, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(begin, 1500);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(INVITE_KEY);
    } catch {
      // Storage blocked: she simply invites again on the next visit.
    }
    if (!inviteDue(seen)) return;
    const timer = window.setTimeout(() => {
      setOpen(true);
      try {
        window.localStorage.setItem(INVITE_KEY, String(Date.now()));
      } catch {
        // Nothing to do.
      }
    }, INVITE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const start = useCallback(() => router.push("/guide"), [router]);

  return (
    <div className={styles.mascot}>
      {open ? (
        <div className={`${styles.invite} ${styles.inviteWrap}`} role="dialog" aria-label="Tess, the site guide">
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">×</button>
          <div className={styles.inviteCore} aria-hidden="true"><TessCore state="idle" getLevel={still} crew={[]} /></div>
          <p>{GUIDE_INVITE_TEXT}</p>
          <button type="button" className={styles.primary} onClick={start}>Get started</button>
        </div>
      ) : (
        <button type="button" className={`${styles.ball} ${alive ? styles.live : ""}`} onClick={start} aria-label="Talk to Tess, the site guide" title="Talk to Tess">
          {alive ? <TessCore state="idle" getLevel={still} crew={[]} small /> : null}
        </button>
      )}
    </div>
  );
}
