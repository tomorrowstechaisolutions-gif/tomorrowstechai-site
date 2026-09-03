"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * A button that reveals a form.
 *
 * Reschedule and Cancel are destructive enough that they should not be four
 * open forms competing for attention at the bottom of a drawer, and small
 * enough that they do not deserve a page of their own. One line of state.
 */
export default function Collapse({
  label,
  children,
  tone = "ghost",
}: {
  label: string;
  children: ReactNode;
  tone?: "ghost" | "danger";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-collapse">
      <button
        type="button"
        className={tone === "danger" ? "cc-btn is-danger" : "cc-btn"}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {label}
      </button>
      {open ? <div className="mt-collapse-body">{children}</div> : null}
    </div>
  );
}
