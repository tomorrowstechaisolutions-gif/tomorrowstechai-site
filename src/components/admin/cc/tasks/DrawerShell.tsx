"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The drawer's behaviour, and nothing else.
 *
 * The drawer's CONTENT is server-rendered from the task's own row, because a
 * panel that fetches on the client shows a spinner every time you click a
 * row. This wrapper only adds the two things a server component cannot:
 * Escape to close, and a scrim that closes on click.
 *
 * Closing is a navigation back to the list's own URL, so the browser's back
 * button does exactly what the X does.
 */
export default function DrawerShell({
  closeHref,
  children,
}: {
  closeHref: string;
  children: ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.push(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  // The page behind the drawer must not scroll under it on a phone, where
  // the drawer is full screen.
  useEffect(() => {
    const { body } = document;
    const previous = body.style.overflow;
    if (window.matchMedia("(max-width: 900px)").matches) body.style.overflow = "hidden";
    return () => { body.style.overflow = previous; };
  }, []);

  return (
    <>
      <div
        className="tk-scrim"
        onClick={() => router.push(closeHref, { scroll: false })}
        aria-hidden="true"
      />
      <aside className="tk-drawer" role="dialog" aria-label="Task details">
        {children}
      </aside>
    </>
  );
}
