import Link from "next/link";
import { notFound } from "next/navigation";
import { SOON_ROUTES } from "@/components/admin/cc/nav";
import { IconArrowRight, IconLayers } from "@/components/admin/cc/Icons";

/**
 * The honest placeholder for a module that has a place in the system but no
 * screen yet.
 *
 * It exists so that nothing in the sidebar or on the dashboard can link to a
 * 404. Only paths listed in SOON_ROUTES are served — anything else still
 * 404s properly, and any real screen wins this route because a static segment
 * always beats a catch-all.
 */

export const dynamic = "force-dynamic";

export default async function ModulePlaceholder({
  params,
}: {
  params: Promise<{ module: string[] }>;
}) {
  const { module } = await params;
  const path = `/admin/${module.join("/")}`;
  const entry = SOON_ROUTES[path];

  if (!entry) notFound();

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>{entry.title}</h1>
          <p>Not built yet — here&rsquo;s what will live here, and where the work happens today.</p>
        </div>
      </div>

      <div className="cc-board">
        <section className="cc-panel cc-s8">
          <div className="cc-panel-head">
            <IconLayers size={15} />
            <h2>{entry.title}</h2>
            <span className="cc-chip t-muted">Planned</span>
          </div>
          <div className="cc-panel-body">
            <p style={{ fontSize: "0.86rem", lineHeight: 1.65, color: "var(--cc-dim)" }}>
              {entry.blurb}
            </p>
            {entry.nearest ? (
              <Link href={entry.nearest.href} className="cc-cta" style={{ marginTop: 14 }}>
                {entry.nearest.label} <IconArrowRight size={13} />
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
