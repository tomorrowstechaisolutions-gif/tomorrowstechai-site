"use server";

import { revalidatePath } from "next/cache";
import { recordMissingClips } from "@/lib/guide/clips";
import { voiceConfigured } from "@/lib/crew/voice";
import { getAdminUser } from "@/lib/supabase/server";

export type GuideRecordState = { message: string; ok: boolean } | null;

/** Record every guide line that has no recording yet. Uses speech credit once per line; visitors never do. */
export async function recordGuideAction(_previous: GuideRecordState, _form: FormData): Promise<GuideRecordState> {
  void _previous;
  void _form;
  const session = await getAdminUser();
  if (!session || !["owner", "admin"].includes(session.admin.role)) return { ok: false, message: "Only an owner or admin can record the guide." };
  if (!voiceConfigured()) return { ok: false, message: "No voice is set up, so nothing was recorded." };
  try {
    const result = await recordMissingClips();
    revalidatePath("/admin/guide");
    revalidatePath("/guide");
    const failed = result.failed.length ? ` ${result.failed.length} failed: ${result.failed.map((f) => `${f.id} (${f.why})`).join("; ")}.` : "";
    return { ok: result.failed.length === 0, message: `Recorded ${result.recorded.length} line${result.recorded.length === 1 ? "" : "s"}. ${result.already} were already recorded.${failed}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Recording failed." };
  }
}
