import { getBatch } from "@/content/social";
import { renderCardJpeg } from "@/lib/social/card";

export const runtime = "nodejs";

/**
 * The card image for one daily social post: /social-card/<batch>/<post>.jpg.
 *
 * Public on purpose: LinkedIn, Facebook and Instagram fetch it when the post
 * goes out. It only ever renders a line from a batch file in this codebase,
 * so nobody can make it draw their own text.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ batch: string; file: string }> }) {
  const { batch: slug, file } = await params;
  const match = /^([a-z0-9][a-z0-9-]{0,39})\.jpg$/.exec(file);
  const post = match ? getBatch(slug)?.posts.find((p) => p.id === match[1]) : undefined;
  // A post with its own photo has no card.
  if (!post || post.image) return new Response("Not found", { status: 404 });

  const jpeg = await renderCardJpeg(post.cardLine);
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      // A day, not forever: a card line can still be corrected before its post goes out.
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
