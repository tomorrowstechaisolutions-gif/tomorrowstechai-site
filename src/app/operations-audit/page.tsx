import Link from "next/link";
import Image from "next/image";
import { LeadMagnetForm } from "@/components/LeadMagnetForm";

export const metadata = {
  title: "Operations Audit Checklist",
  description:
    "Free PDF — 12 questions to ask before adding AI to your operation. Self-audit your foundation in 5 minutes. By John Hockinson, founder of Tomorrow’s Tech AI.",
  alternates: { canonical: "/operations-audit" },
  openGraph: {
    title: "The Operations Audit Checklist · Tomorrow’s Tech AI",
    description:
      "12 questions to ask before adding AI to your operation. Score yourself honestly — find out where your foundation is ready and where it needs work.",
    url: "https://tomorrowstechai.com/operations-audit",
    type: "article",
  },
};

const previewQuestions = [
  "Where does each piece of operational data live today?",
  "Is there a single source of truth — or are three systems claiming to be it?",
  "What questions does leadership keep asking that take more than 5 minutes to answer?",
  "What gets done by tribal knowledge that should be in a system?",
  "What's your propose-vs-act boundary going to be?",
];

export default function OperationsAuditPage() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-4">
        <div className="relative w-full aspect-[1735/906] overflow-hidden rounded-lg border border-[color:var(--color-border)]">
          <Image
            src="/audit-ad.png"
            alt="Free download: 12 questions to ask before you add AI to your operation"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 1100px"
            className="object-cover"
          />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pt-8 pb-12">
        <div className="grid md:grid-cols-5 gap-10 items-start">
          <div className="md:col-span-3">
            <div className="eyebrow mb-6">● Free download</div>
            <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] mb-6">
              12 questions to ask before adding AI to your operation.
            </h1>
            <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed mb-8">
              Most AI integrations fail before they start. Not because the AI
              isn&apos;t smart enough — because the underlying operations
              aren&apos;t ready for it.
            </p>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-8 max-w-2xl">
              This is the checklist we walk through with every new client before
              suggesting AI anywhere. Five minutes to score. Three pages.
              Operator-grounded, no fluff.
            </p>

            <div className="space-y-6 mb-10">
              <div>
                <div className="eyebrow-muted mb-3">What&apos;s inside</div>
                <ul className="space-y-2">
                  <li className="flex items-start gap-3 text-[color:var(--color-text)] leading-relaxed">
                    <span className="text-[color:var(--color-cyan)] font-mono mt-0.5">→</span>
                    <span>The 12 questions, organized by foundation area</span>
                  </li>
                  <li className="flex items-start gap-3 text-[color:var(--color-text)] leading-relaxed">
                    <span className="text-[color:var(--color-cyan)] font-mono mt-0.5">→</span>
                    <span>How to score yourself in five minutes</span>
                  </li>
                  <li className="flex items-start gap-3 text-[color:var(--color-text)] leading-relaxed">
                    <span className="text-[color:var(--color-cyan)] font-mono mt-0.5">→</span>
                    <span>What to do with the result (3 tiers, depending on score)</span>
                  </li>
                  <li className="flex items-start gap-3 text-[color:var(--color-text)] leading-relaxed">
                    <span className="text-[color:var(--color-cyan)] font-mono mt-0.5">→</span>
                    <span>The propose-vs-act boundary that most teams skip</span>
                  </li>
                </ul>
              </div>

              <div>
                <div className="eyebrow-muted mb-3">Sample questions</div>
                <ul className="space-y-2">
                  {previewQuestions.map((q, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-[15px] text-[color:var(--color-text-secondary)] leading-relaxed"
                    >
                      <span className="font-mono text-[color:var(--color-cyan)] text-xs mt-1.5 tracking-widest">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{q}</span>
                    </li>
                  ))}
                  <li className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)] ml-7 pt-2">
                    + 7 more in the PDF
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="card p-6 md:sticky md:top-24">
              <div className="font-mono text-xs tracking-widest text-[color:var(--color-cyan)] uppercase mb-3">
                ● Get the PDF
              </div>
              <h2 className="text-xl font-medium mb-2">Free. Instant.</h2>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mb-6">
                Drop your email. We&apos;ll send the PDF and a copy goes
                straight to your inbox.
              </p>
              <LeadMagnetForm />
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-[color:var(--color-border)]">
        <div className="eyebrow-muted mb-3">● Why this checklist exists</div>
        <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-6">
          The pattern we see, over and over.
        </h2>
        <div className="prose-blog">
          <p>
            Most businesses get the order of operations wrong. They watch a
            competitor announce an AI feature, panic, and start shopping for
            tools. The tools don&apos;t fix the foundation problem — they
            amplify it.
          </p>
          <p>
            Disorganized data produces disorganized AI. Tribal knowledge stays
            tribal. Manual handoffs stay manual. The AI is just faster at
            getting the wrong answer.
          </p>
          <p>
            The 12 questions in this checklist are the ones we ask before
            suggesting any AI engagement. If you can&apos;t answer most of
            them confidently, AI isn&apos;t the right next move — clean
            operations are. The PDF tells you exactly what to do based on your
            score.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="card card-accent p-10">
          <div className="eyebrow mb-3">● After you read it</div>
          <h3 className="text-2xl font-medium tracking-tight mb-3">
            Want to walk through this for your operation?
          </h3>
          <p className="text-[color:var(--color-text-secondary)] mb-6 max-w-xl">
            Once you&apos;ve scored yourself, book a 30-minute discovery call.
            We&apos;ll walk the 12 questions against your specific business and
            tell you honestly whether AI is the right next move.
          </p>
          <Link href="/contact" className="btn-primary">
            Book a discovery call →
          </Link>
        </div>
      </section>
    </>
  );
}
