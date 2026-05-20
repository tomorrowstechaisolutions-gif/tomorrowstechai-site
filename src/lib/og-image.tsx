import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

type Props = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
};

export function generateOgImage({ title, subtitle, eyebrow }: Props) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#07090E",
          backgroundImage:
            "linear-gradient(rgba(0, 217, 255, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 217, 255, 0.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#F4F6F8",
          position: "relative",
        }}
      >
        {/* Top brand bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "#00D9FF",
            }}
          />
          <div
            style={{
              color: "#00D9FF",
              fontSize: 22,
              fontFamily: "monospace",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
            }}
          >
            TomorrowsTech AI
          </div>
        </div>

        {/* Center content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            maxWidth: 1000,
          }}
        >
          {eyebrow && (
            <div
              style={{
                color: "rgba(244, 246, 248, 0.6)",
                fontSize: 22,
                fontFamily: "monospace",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </div>
          )}
          <div
            style={{
              fontSize: 88,
              fontWeight: 500,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 32,
                color: "rgba(244, 246, 248, 0.7)",
                lineHeight: 1.35,
                display: "flex",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* Bottom row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "rgba(244, 246, 248, 0.5)",
            fontSize: 20,
            fontFamily: "monospace",
            letterSpacing: "0.1em",
          }}
        >
          <div>tomorrowstechai.com</div>
          <div style={{ color: "#00D9FF" }}>PROPOSE · NEVER ACT</div>
        </div>
      </div>
    ),
    { ...ogSize }
  );
}
