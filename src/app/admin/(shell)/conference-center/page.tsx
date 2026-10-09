import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { getMeetingById } from "@/lib/meetings/queries";
import { providerFor } from "@/lib/meetings/providers";
import {
  conferenceContacts, getConferenceAnalytics, getConferenceKpis,
  listConferenceHistory, listConsultationRequests, listUpcomingConferences,
} from "@/lib/conference/queries";
import { HISTORY_FILTERS } from "@/lib/conference/config";
import type { HistoryFilter } from "@/lib/conference/config";
import { getConferenceSettings } from "@/lib/conference/settings";
import { zoomConnection } from "@/lib/zoom/oauth";
import { chicagoDate } from "@/lib/time/chicago";
import {
  inviteToConferenceAction, scheduleConferenceAction, startInstantConferenceAction,
} from "@/app/admin/conference-actions";
import ConferenceLaunchers from "@/components/admin/cc/conference/ConferenceLaunchers";
import {
  ConferenceAnalyticsPanel, ConferenceHistory, ConferenceKpiRow,
  ConsultationRequests, UpcomingConferences,
} from "@/components/admin/cc/conference/ConferenceBoards";
import MeetingDrawer from "@/components/admin/cc/meetings/MeetingDrawer";
import { Panel } from "@/components/admin/cc/Panel";
import { IconAlert, IconSettings } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conference Center" };

/**
 * The Conference Center.
 *
 * A Zoom-first view over the same `meetings` table the Meetings screen, the
 * Calendar and every CRM record already read — so a conference scheduled
 * here is on the calendar, on the lead's timeline and on the client record
 * with no second copy anywhere.
 *
 * Deep links:
 *   ?conference=<id>[&do=reschedule|cancel|complete]   open the detail drawer
 *   ?schedule=1&contact=lead:<id>|client:<id>[&category=…][&proposal=…][&job=…]
 *                                                      open Schedule pre-filled
 *   ?history=…&hq=…&hp=…&page=…                         history filters
 */
/** Dates relative to now, computed per request (this page is force-dynamic). */
function daysFromNow(days: number): string {
  return chicagoDate(new Date(Date.now() + days * 86_400_000));
}

export default async function ConferenceCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  const historyRaw = one("history");
  const history: HistoryFilter = HISTORY_FILTERS.some((f) => f.key === historyRaw)
    ? (historyRaw as HistoryFilter) : "all";
  const hq = (one("hq") ?? "").slice(0, 80);
  const hp = one("hp") ?? "";
  const page = Math.max(1, Math.min(500, Number(one("page") ?? "1") || 1));
  const openId = one("conference");
  const doRaw = one("do");
  const focus = doRaw === "reschedule" || doRaw === "cancel" || doRaw === "complete" ? doRaw : null;
  const routeError = one("error");

  const uuid = /^[0-9a-f-]{36}$/i;
  const presetContact = one("contact") && /^(lead|client):[0-9a-f-]{36}$/i.test(one("contact") as string)
    ? (one("contact") as string) : null;
  const proposalId = one("proposal") && uuid.test(one("proposal") as string) ? one("proposal") as string : null;
  const jobId = one("job") && uuid.test(one("job") as string) ? one("job") as string : null;

  const supabase = await createSupabaseServerClient();

  const [kpis, upcoming, requests, historyPage, analytics, contacts, zoomStatus, connection, settings, openMeeting] =
    await Promise.all([
      getConferenceKpis(supabase),
      listUpcomingConferences(supabase),
      listConsultationRequests(supabase),
      listConferenceHistory(supabase, { filter: history, search: hq, provider: hp, page }),
      getConferenceAnalytics(supabase, 90),
      conferenceContacts(supabase),
      providerFor("zoom").status(),
      zoomConnection(),
      getConferenceSettings(),
      openId && uuid.test(openId) ? getMeetingById(supabase, openId) : Promise.resolve(null),
    ]);

  const closeParams = new URLSearchParams();
  if (history !== "all") closeParams.set("history", history);
  if (hq) closeParams.set("hq", hq);
  if (hp) closeParams.set("hp", hp);
  if (page > 1) closeParams.set("page", String(page));
  const closeHref = `/admin/conference-center${closeParams.toString() ? `?${closeParams}` : ""}`;

  return (
    <>
      <header className="cc-greet cf-head">
        <div>
          <h1>Conference Center</h1>
          <p>
            Zoom conferences for sales, clients and partners — created in Zoom, linked to the CRM,
            and on the calendar the moment Zoom confirms them.
          </p>
        </div>
        <div className="cf-head-right">
          <span className={`cf-zoom ${zoomStatus.ready ? "is-on" : "is-off"}`}>
            <span className="cf-zoom-dot" aria-hidden="true" />
            {zoomStatus.ready
              ? <>Zoom connected{connection.account ? <> · <b>{connection.account}</b></> : null}{connection.planLabel ? ` · ${connection.planLabel}` : ""}</>
              : connection.configured ? "Zoom not connected" : "Zoom not configured"}
          </span>
          <Link href="/admin/conference-center/settings" className="cc-btn">
            <IconSettings size={14} /> Zoom settings
          </Link>
        </div>
      </header>

      {!zoomStatus.ready ? (
        <div className="mt-alert cf-alert">
          <IconAlert size={15} />
          <div>
            <b>Conferences need a Zoom connection.</b>
            <p>{zoomStatus.reason}</p>
            <Link href="/admin/conference-center/settings" className="cc-btn">Open Zoom settings</Link>
          </div>
        </div>
      ) : connection.lastError ? (
        <div className="mt-alert cf-alert">
          <IconAlert size={15} />
          <div>
            <b>Zoom reported an error.</b>
            <p>{connection.lastError}</p>
            <Link href="/admin/conference-center/settings" className="cc-btn">Check the connection</Link>
          </div>
        </div>
      ) : null}

      {routeError ? <p className="cc-error cf-err" role="alert">{routeError}</p> : null}

      <ConferenceLaunchers
        zoomReady={zoomStatus.ready}
        zoomReason={zoomStatus.reason ?? null}
        contacts={contacts}
        defaultDate={daysFromNow(1)}
        defaultTimezone={settings.default_timezone}
        defaultDuration={settings.default_duration_minutes}
        sendInvites={settings.send_invites_by_email}
        startInstant={startInstantConferenceAction}
        invite={inviteToConferenceAction}
        schedule={scheduleConferenceAction}
        presetContact={presetContact}
        presetCategory={one("category") ?? null}
        openSchedule={one("schedule") === "1" && zoomStatus.ready}
        proposalId={proposalId}
        jobId={jobId}
      />

      <ConferenceKpiRow kpis={kpis} />

      <Panel title="Upcoming conferences" sub={`${upcoming.length} open`} bodyClass="flush" className="cf-panel">
        <UpcomingConferences meetings={upcoming} />
      </Panel>

      <div className="cf-grid">
        <Panel title="Consultation requests" sub="awaiting confirmation" className="cf-panel">
          <ConsultationRequests requests={requests} bookingLive={false} />
        </Panel>
        <Panel title="Conference analytics" sub="last 90 days" className="cf-panel">
          <ConferenceAnalyticsPanel a={analytics} />
        </Panel>
      </div>

      <section id="history">
        <Panel title="Meeting history" sub={`${historyPage.total} total`} className="cf-panel">
          <ConferenceHistory
            rows={historyPage.rows}
            total={historyPage.total}
            filter={history}
            search={hq}
            provider={hp}
            page={page}
          />
        </Panel>
      </section>

      {openMeeting ? (
        <MeetingDrawer
          meeting={openMeeting}
          closeHref={closeHref}
          followUpDefault={daysFromNow(3)}
          focus={focus}
        />
      ) : null}
    </>
  );
}
