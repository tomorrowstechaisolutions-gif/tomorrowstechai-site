"use client";

import { useOptimistic, useTransition } from "react";
import { toggleTaskDone } from "@/app/admin/dashboard-actions";

/**
 * The one thing on the Today card you can actually close from here.
 *
 * Optimistic, because the round trip is a revalidate of the whole dashboard
 * and a checkbox that waits half a second to tick feels broken.
 */
export default function TaskCheck({
  taskId,
  label,
}: {
  taskId: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useOptimistic(false);

  return (
    <input
      type="checkbox"
      className="cc-check"
      checked={done}
      disabled={pending}
      aria-label={`Mark done: ${label}`}
      onChange={(e) => {
        const next = e.currentTarget.checked;
        startTransition(async () => {
          setDone(next);
          const fd = new FormData();
          fd.set("task_id", taskId);
          fd.set("done", String(next));
          await toggleTaskDone(fd);
        });
      }}
    />
  );
}
