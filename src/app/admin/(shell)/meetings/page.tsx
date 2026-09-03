import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { MEETING_TABS } from "@/lib/meetings/config";
import type { MeetingTab } from "@/lib/meetings/config";
import {
  getMeetingById, getMeetingKpis, listMeetings,
} from "@/lib/meetings/queries";
import { providerStatuses } from "@/lib/meetings/providers";
import { scheduleMeetingAction } from "@/app/admin/meeting-actions";
import MeetingsBoard from "@/components/admin/cc/panels/MeetingsBoard";
import MeetingDrawer from "@/components/admin/cc/meetings/MeetingDrawer";
import ScheduleMeetingButton from "@/components/admin/cc/meetings/ScheduleMeetingButton";
import { BUSINESS_TIMEZONE, BUSINESS_TIMEZONE_LABEL } from "@/lib/calendar/config";
import { chicagoDate } from "@/lib/time/chicago";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meetings" };

/**
 * The Meetings Center.
 *
 * The detail panel opens from a `?meeting=` parameter rather than a route
 * change — the same decision the task board made, for the same reason: the
 * list keeps its place and the back button closes the drawer.
 *
 * Scheduling from HERE has no contact yet, so the button opens with an empty
 * card and the person picks. Every other entry point resolves the contact on
 * the server first, which is why this is the only place that needs the
 * fallback.
 */
export default async function MeetingsPage({
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

  const requested = one("tab");
  const tab: MeetingTab = (MEETING_TABS as readonly { key: string }[]).some((t) => t.key === requested)
    ? (requested as MeetingTab)
    : "today";
  const search = one("q") ?? "";
  const openId = one("meeting");

  const supabase = await createSupabaseServerClient();

  const [kpis, meetings, providers, openMeeting] = await Promise.all([
    getMeetingKpis(supabase),
    listMeetings(supabase, { tab, search }),
    providerStatuses(),
    openId ? getMeetingById(supabase, openId) : Promise.resolve(null),
  ]);

  // Scheduling from the centre: no record was clicked, so there is no contact
  // to resolve. The form still needs somewhere to put a name and an email.
  const blankContact = {
    leadId: null, customerId: null, companyId: null, jobId: null, proposalId: null,
    name: null, company: null, email: null, phone: null, href: null, initials: "?",
  };

  const closeParams = new URLSearchParams();
  closeParams.set("tab", tab);
  if (search) closeParams.set("q", search);
  const closeHref = `/admin/meetings?${closeParams.toString()}`;

  const followUpDefault = chicagoDate(new Date(Date.now() + 3 * 86_400_000));

  return (
    <>
      <header className="cc-greet">
        <div>
          <h1>Meetings</h1>
          <p>
            Every conversation with a lead or a client — booked, started and written up.
            Each one also appears on the calendar and on the record it belongs to.
          </p>
        </div>
      </header>

      <MeetingsBoard
        kpis={kpis}
        meetings={meetings}
        tab={tab}
        search={search}
        newMeeting={
          <ScheduleMeetingButton
            contact={blankContact}
            providers={providers}
            action={scheduleMeetingAction}
            defaultDate={chicagoDate(new Date(Date.now() + 86_400_000))}
            timezone={BUSINESS_TIMEZONE}
            timezoneLabel={BUSINESS_TIMEZONE_LABEL}
            returnTo={closeHref}
          />
        }
      />

      {openMeeting ? (
        <MeetingDrawer
          meeting={openMeeting}
          closeHref={closeHref}
          followUpDefault={followUpDefault}
        />
      ) : null}
    </>
  );
}
