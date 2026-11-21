/**
 * The email John gets when a visitor finishes the site guide.
 *
 * A guide lead is matched to an existing lead by email, and the Leads list is
 * ordered by when a lead was first created. So someone who comes back and runs
 * the guide would otherwise go unnoticed: their answers land on a record he
 * has no reason to open. This email is what tells him.
 */

export type GuideAlertInput = {
  name: string;
  email: string;
  phone: string;
  /** What they were after, in a few words (the outcome's `need`). */
  need: string;
  /** Their answers, one per line. */
  summary: string;
  /** Anything they typed in their own words. */
  typed: string[];
  wantsCall: boolean;
  leadUrl: string | null;
  /** True when this person was already a lead before this visit. */
  returning: boolean;
};

export function guideAlert(input: GuideAlertInput): { subject: string; text: string } {
  const need = input.need.charAt(0).toLowerCase() + input.need.slice(1);
  const subject = input.wantsCall ? `Call requested: ${input.name} (${need})` : `Site guide: ${input.name} needs ${need}`;
  const lines = [
    input.wantsCall ? `${input.name} went through the site guide and asked for a call from you.` : `${input.name} went through the site guide.`,
    "",
    `Email: ${input.email}`,
    `Phone: ${input.phone || "no phone given"}`,
    "",
    "Their answers:",
    input.summary,
  ];
  if (input.typed.length) lines.push("", `In their own words: ${input.typed.map((w) => `"${w}"`).join(" ")}`);
  if (input.returning) lines.push("", "This person was already a lead, so they are not at the top of your Leads list. Their answers are on their existing record.");
  if (input.leadUrl) lines.push("", `Open the lead: ${input.leadUrl}`);
  return { subject, text: lines.join("\n") };
}
