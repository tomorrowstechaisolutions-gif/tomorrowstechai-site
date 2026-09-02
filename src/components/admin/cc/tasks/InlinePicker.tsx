"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A chip you click to change a value, in one click, with no dialog.
 *
 * Each option is its own tiny form posting to a server action, so the change
 * is a real submission that works without JavaScript having to marshal
 * anything — and every one of those actions writes a task_events row, which
 * is what makes "no confirmation step" safe: the change is recoverable from
 * the history rather than prevented by a prompt.
 */
export default function InlinePicker({
  action,
  taskId,
  field,
  current,
  label,
  className,
  options,
}: {
  action: (formData: FormData) => void | Promise<void>;
  taskId: string;
  /** The form field the chosen value is posted as. */
  field: string;
  current: string;
  label: string;
  className: string;
  options: { value: string; label: string; className: string }[];
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="tk-picker" ref={wrap}>
      <button
        type="button"
        className={`tk-chip ${className} is-editable`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>

      {open ? (
        <div className="tk-picker-menu" role="menu">
          {options.map((option) => (
            <form
              key={option.value}
              action={action}
              onSubmit={() => setOpen(false)}
            >
              <input type="hidden" name="task_id" value={taskId} />
              <input type="hidden" name={field} value={option.value} />
              <button
                type="submit"
                className={`tk-picker-option ${option.value === current ? "is-current" : ""}`}
                role="menuitem"
              >
                <span className={`tk-dot ${option.className}`} aria-hidden="true" />
                {option.label}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </div>
  );
}
