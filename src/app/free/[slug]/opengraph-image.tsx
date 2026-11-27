import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { SERIES_NAME, VOLUMES, getVolume } from "@/lib/academy/library";

/**
 * The picture LinkedIn, Facebook and X show when a /free/<guide> link is
 * posted: the real cover on the left, the offer on the right. Built once at
 * deploy time from the JPEG cover in public/academy/covers.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Free guide from Tomorrow’s Tech AI";

export function generateStaticParams() {
  return VOLUMES.filter((v) => v.magnet).map((v) => ({ slug: v.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const volume = getVolume(slug);

  let cover: string | null = null;
  if (volume?.shareCover) {
    try {
      const bytes = await readFile(path.join(process.cwd(), volume.shareCover));
      cover = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    } catch {
      cover = null;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: "0 72px",
          background: "#04070D",
          backgroundImage:
            "linear-gradient(rgba(59, 130, 246, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.07) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          color: "#E9EFF7",
        }}
      >
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            width={378}
            height={504}
            style={{ borderRadius: 10, border: "1px solid #1B2739", boxShadow: "0 30px 60px rgba(0,0,0,0.6)", objectFit: "cover" }}
            alt=""
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 22 }}>
          <div style={{ display: "flex", color: "#60A5FA", fontSize: 22, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Free guide · Volume {volume?.number ?? ""}
          </div>
          <div style={{ display: "flex", fontSize: 60, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            {volume?.title ?? SERIES_NAME}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "rgba(233, 239, 247, 0.72)", lineHeight: 1.35 }}>
            {volume?.subtitle ?? ""}
          </div>
          <div style={{ display: "flex", marginTop: 14 }}>
            <div
              style={{
                display: "flex",
                background: "#3B82F6",
                color: "#fff",
                fontSize: 26,
                fontWeight: 600,
                padding: "14px 28px",
                borderRadius: 10,
              }}
            >
              Get your free copy →
            </div>
          </div>
          <div style={{ display: "flex", color: "rgba(233, 239, 247, 0.45)", fontSize: 20, letterSpacing: "0.12em", marginTop: 8 }}>
            TOMORROWSTECHAI.COM
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
