import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadActivity } from "@/lib/dashboard/activity";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import { ago } from "../format";
import {
  IconBriefcase,
  IconCheckSquare,
  IconDollar,
  IconFunnel,
  IconPulse,
  IconShare,
  IconSpark,
} from "../Icons";

/** Section 11 — everything that happened, newest first. */

const MODULE_ICON = {
  lead: IconFunnel,
  project: IconBriefcase,
  finance: IconDollar,
  social: IconShare,
  task: IconCheckSquare,
  ai: IconSpark,
} as const;

export default async function ActivityPanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("activity", () => loadActivity(supabase, 10));

  return (
    <Panel
      title="Recent activity"
      icon={<IconPulse size={15} />}
      action={{ href: "/admin/activity", label: "All activity" }}
      className={className}
      bodyClass="flush"
    >
      {!result.ok ? (
        <ErrorState message={result.error} />
      ) : result.data.length === 0 ? (
        <EmptyState
          title="Nothing has happened yet"
          text="Every lead, note, status change, payment and published post lands here the moment it occurs."
          icon={<IconPulse size={17} />}
        />
      ) : (
        <div className="cc-feed">
          {result.data.map((item) => {
            const Icon = MODULE_ICON[item.module] ?? IconPulse;
            return (
              <Link key={item.id} href={item.href} className="cc-feed-item">
                <span className={`cc-feed-icon m-${item.module}`}>
                  <Icon size={13} />
                </span>
                <span className="cc-feed-main">
                  <span className="cc-feed-title">{item.title}</span>
                  {item.subtitle ? <span className="cc-feed-sub">{item.subtitle}</span> : null}
                </span>
                <span className="cc-feed-when">{ago(item.at)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
