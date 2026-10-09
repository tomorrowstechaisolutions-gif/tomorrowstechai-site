import Link from "next/link";
import type { MeetingContact } from "@/lib/meetings/types";
import { IconVideo } from "../Icons";

/**
 * "Schedule Conference" from a lead, client, proposal or project.
 *
 * Opens the Conference Center's Schedule form with the contact, category and
 * related record already filled in, so the conference is linked to the same
 * CRM record and appears on its timeline.
 */
export default function ScheduleConferenceLink({
  contact, category, proposalId, jobId, label = "Schedule Conference",
}: {
  contact: MeetingContact;
  category: string;
  proposalId?: string | null;
  jobId?: string | null;
  label?: string;
}) {
  const params = new URLSearchParams({ schedule: "1", category });
  if (contact.customerId) params.set("contact", `client:${contact.customerId}`);
  else if (contact.leadId) params.set("contact", `lead:${contact.leadId}`);
  if (proposalId) params.set("proposal", proposalId);
  if (jobId) params.set("job", jobId);
  return (
    <Link href={`/admin/conference-center?${params.toString()}`} className="cc-btn">
      <IconVideo size={14} /> {label}
    </Link>
  );
}
