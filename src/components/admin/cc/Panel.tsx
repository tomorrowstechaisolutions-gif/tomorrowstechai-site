import Link from "next/link";
import type { ReactNode } from "react";
import { IconAlert, IconArrowRight, IconInbox } from "./Icons";
import type { PanelResult } from "@/lib/dashboard/panel";

/**
 * The three states every panel has to be able to be in, in one place.
 *
 * Loading, empty and error are not edge cases here — on a dashboard for a
 * business that is still filling up, empty is the normal state for half the
 * board, and an empty panel that just prints zeros teaches the operator to
 * distrust the numbers that are real.
 */

export function Panel({
  title,
  sub,
  icon,
  action,
  className = "",
  bodyClass = "",
  children,
  footer,
}: {
  title: string;
  sub?: string;
  icon?: ReactNode;
  action?: { href: string; label: string };
  className?: string;
  bodyClass?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={`cc-panel ${className}`}>
      <div className="cc-panel-head">
        {icon}
        <h2>{title}</h2>
        {sub ? <span className="cc-sub">{sub}</span> : null}
        {action ? (
          <Link href={action.href} className="cc-more">
            {action.label} <IconArrowRight size={13} />
          </Link>
        ) : null}
      </div>
      {bodyClass === "flush" ? children : <div className={`cc-panel-body ${bodyClass}`}>{children}</div>}
      {footer ? <div className="cc-panel-foot">{footer}</div> : null}
    </section>
  );
}

export function EmptyState({
  title,
  text,
  cta,
  icon,
}: {
  title: string;
  text: string;
  cta?: { href: string; label: string };
  icon?: ReactNode;
}) {
  return (
    <div className="cc-empty">
      <span className="cc-empty-icon">{icon ?? <IconInbox size={17} />}</span>
      <span className="cc-empty-title">{title}</span>
      <p className="cc-empty-text">{text}</p>
      {cta ? (
        <Link href={cta.href} className="cc-cta">
          {cta.label} <IconArrowRight size={13} />
        </Link>
      ) : null}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="cc-error">
      <IconAlert size={15} />
      <span>
        {message} The rest of the dashboard is unaffected — reload to try this
        panel again.
      </span>
    </div>
  );
}

/** Shown inside a Suspense boundary while a panel's own queries run. */
export function PanelSkeleton({ rows = 4, title }: { rows?: number; title: string }) {
  return (
    <section className="cc-panel" aria-busy="true" aria-label={`${title} loading`}>
      <div className="cc-panel-head">
        <h2>{title}</h2>
      </div>
      <div className="cc-skel-stack">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={`cc-skel cc-skel-line ${
              i % 3 === 0 ? "w-80" : i % 3 === 1 ? "w-100" : "w-60"
            }`}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Renders a panel result, or the error state. Saves every panel repeating the
 * same four lines and guarantees none of them forgets the failure case.
 */
export function Resolved<T>({
  result,
  children,
}: {
  result: PanelResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (!result.ok) return <ErrorState message={result.error} />;
  return <>{children(result.data)}</>;
}
