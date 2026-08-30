import { Suspense } from "react";
import type { Metadata } from "next";
import SeoBoard, { SeoBoardSkeleton } from "@/components/admin/cc/panels/SeoBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SEO" };

/**
 * The SEO Command Center.
 *
 * Answers, in order: are we being found, what for, which pages perform, what
 * is broken, and what to do next. The audit runs against the live deployment
 * over HTTP, so the whole board is dynamic — there is nothing here worth
 * caching that would not be wrong within the hour.
 */
export default function SeoPage() {
  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>SEO</h1>
          <p>
            What the site is found for, which pages earn leads, what is broken, and what to write
            next.
          </p>
        </div>
      </div>

      <Suspense fallback={<SeoBoardSkeleton />}>
        <SeoBoard />
      </Suspense>
    </>
  );
}
