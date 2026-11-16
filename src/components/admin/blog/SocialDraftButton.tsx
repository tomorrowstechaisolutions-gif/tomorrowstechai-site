"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSocialDraftAction } from "@/app/admin/blog-actions";

/** "Create social post": proposes a draft in Social Center; never posts. */
export function SocialDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; postId?: string } | null>(null);

  return (
    <div className="be-endrow" style={{ display: "flex", flexWrap: "wrap" }}>
      <button
        type="button"
        className="cc-btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createSocialDraftAction(id);
            setMsg({ ok: r.ok, text: r.message, postId: r.postId });
            router.refresh();
          })
        }
      >
        {pending ? "Creating…" : "Create social post draft"}
      </button>
      {msg ? (
        <span className={msg.ok ? "cc-faint" : "be-err-text"} role="status">
          {msg.text}{" "}
          {msg.postId ? (
            <Link href={`/admin/marketing/social?tab=queue&post=${msg.postId}`} className="cc-link">Open in Social Center</Link>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
