import Link from "next/link";
import { AdCopyStudio } from "@/components/admin/AdCopyStudio";
import { createAd } from "../../../../actions";

export const dynamic = "force-dynamic";

export default function NewAdPage() {
  return (
    <>
      <header className="ad-head">
        <Link href="/admin/marketing/ads" className="ad-link">
          ← Back to Ad Studio
        </Link>
        <h1>New ad</h1>
        <p>
          Describe what you want and it writes three versions, each leading with a
          different angle. Pick one, edit it, then copy it into Ads Manager.
        </p>
      </header>

      <AdCopyStudio action={createAd} />
    </>
  );
}
