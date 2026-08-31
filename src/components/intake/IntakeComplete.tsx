import type { IntakeRecord } from "@/lib/intake/config";
import { STARTER_PROMISED_DAYS } from "@/lib/intake/config";

/**
 * The end of the wizard, and also what the client sees if they open their
 * link again afterwards. Says what happens next in plain terms, because the
 * question after "submitted" is always "so when do I get it?".
 */
export function IntakeComplete({
  intake,
  fileCount,
}: {
  intake: IntakeRecord;
  fileCount: number;
}) {
  const submitted = intake.submitted_at
    ? new Date(intake.submitted_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <main className="itk-page">
      <div className="itk-shell itk-shell--narrow">
        <div className="itk-brandline">Tomorrow&rsquo;s Tech AI</div>

        <div className="itk-done-mark" aria-hidden="true">
          &#10003;
        </div>

        <h1 className="itk-h1">Your website intake is complete.</h1>
        <p className="itk-lead">
          We have everything required to begin your Starter Website
          {intake.business_name ? ` for ${intake.business_name}` : ""}.
        </p>

        <div className="itk-done-facts">
          {submitted ? (
            <div>
              <span>Submitted</span>
              <strong>{submitted}</strong>
            </div>
          ) : null}
          <div>
            <span>Files received</span>
            <strong>{fileCount}</strong>
          </div>
          <div>
            <span>Build window</span>
            <strong>{STARTER_PROMISED_DAYS} business days</strong>
          </div>
        </div>

        <h2 className="itk-h2">What happens now</h2>
        <ol className="itk-steps-list">
          <li>
            We read through everything you sent and check we can build from it.
            If something is unclear we will email you rather than guess.
          </li>
          <li>
            Your {STARTER_PROMISED_DAYS}-business-day build window starts once
            that check passes.
          </li>
          <li>
            You get a link to review the site, and one round of revisions.
          </li>
          <li>We point the domain, turn on SSL, and you are live.</li>
        </ol>

        <p className="itk-fineprint">
          Need to change something you sent? Reply to your confirmation email —
          this form is now closed so nothing gets edited midway through a build.
        </p>
      </div>
    </main>
  );
}
