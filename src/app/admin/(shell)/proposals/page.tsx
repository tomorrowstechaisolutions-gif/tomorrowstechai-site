import { Suspense } from "react";
import type { Metadata } from "next";
import ProposalsBoard, { ProposalsBoardSkeleton } from "@/components/admin/cc/panels/ProposalsBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposals" };

export default function ProposalsPage() {
  return <Suspense fallback={<ProposalsBoardSkeleton />}><ProposalsBoard /></Suspense>;
}
