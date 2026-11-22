import { ImageResponse } from "next/og";
import sharp from "sharp";

/**
 * The card image for a daily social post: its key line on a dark background
 * with the Tomorrow's Tech AI wordmark. Instagram will not take a post
 * without an image, so every batch post without a real photo gets one.
 *
 * Plain on purpose. These go to a construction and operations audience on
 * LinkedIn, Facebook and Instagram: no neon, no robots, no stock art.
 */

export const CARD_WIDTH = 1080;
/** 4:5, the tallest shape Instagram accepts. */
export const CARD_HEIGHT = 1350;

const BACKGROUND = "#020813";
const ACCENT = "#26a8ff";

/** Bigger type for a short line, smaller for a long one, so it always fits. */
export function cardFontSize(line: string): number {
  if (line.length <= 50) return 84;
  if (line.length <= 80) return 68;
  return 56;
}

/** The card as JPEG bytes. Instagram asks for JPEG; next/og renders PNG, so it is converted. */
export async function renderCardJpeg(line: string): Promise<Buffer> {
  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          background: BACKGROUND, color: "white", fontFamily: "Arial, sans-serif", padding: 96,
        }}
      >
        <div style={{ display: "flex", width: 120, height: 8, background: ACCENT }} />
        <div style={{ display: "flex", fontSize: cardFontSize(line), fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.02em" }}>
          {line}
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 800, letterSpacing: "0.035em" }}>
          <span>TOMORROW’S TECH</span>
          <span style={{ color: ACCENT, marginLeft: 12 }}>AI</span>
        </div>
      </div>
    ),
    { width: CARD_WIDTH, height: CARD_HEIGHT }
  );
  const png = Buffer.from(await response.arrayBuffer());
  return sharp(png).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
