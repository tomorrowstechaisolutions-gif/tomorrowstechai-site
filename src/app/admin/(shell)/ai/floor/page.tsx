import type { Metadata } from "next";
import { redirect } from "next/navigation";
import FloorScene from "@/components/admin/cc/floor/FloorScene";
import { getAdminUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "The floor" };
export const dynamic = "force-dynamic";

/**
 * The floor: the crew at work, in 3D. Everything on it comes from the crew's
 * step log through /api/admin/crew/steps; the page itself holds no data.
 */
export default async function FloorPage() {
  if (!(await getAdminUser())) redirect("/admin/login");
  return <FloorScene />;
}
