import "server-only";
import { ImageResponse } from "next/og";
import type { CatalogSnapshot, CreativeBrief } from "./types";

const fit = (value: string, max: number) => value.length <= max ? value : `${value.slice(0, max - 1).trim()}…`;

export async function renderCreative(input: {
  background: Buffer; width: number; height: number; snapshot: CatalogSnapshot; brief: CreativeBrief;
}) {
  const { width, height, snapshot, brief } = input;
  const portrait = height > width * 1.25;
  const compact = height < 800;
  const bg = `data:image/png;base64,${input.background.toString("base64")}`;
  const pad = Math.round(Math.min(width, height) * 0.055);
  const titleSize = Math.round(Math.min(width * 0.07, height * 0.09));
  const features = brief.features.slice(0, portrait ? 6 : compact ? 3 : 5);
  const priceMain = snapshot.price.replace(/\/month| one time/gi, "");
  const response = new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: "#020813", color: "white", fontFamily: "Arial, sans-serif" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={bg} width={width} height={height} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", background: "linear-gradient(90deg, rgba(1,7,17,.98) 0%, rgba(2,9,22,.92) 42%, rgba(2,9,22,.15) 76%, rgba(2,9,22,.5) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", background: "linear-gradient(0deg, rgba(0,5,14,.96) 0%, transparent 38%, rgba(0,5,14,.38) 100%)" }} />
      <div style={{ position: "relative", width: "100%", height: "100%", padding: pad, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: Math.round(pad * .25) }}>
            <div style={{ color: "#26a8ff", fontWeight: 900, fontStyle: "italic", fontSize: Math.round(titleSize * .62), letterSpacing: "-.08em" }}>TT</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: Math.round(titleSize * .29), fontWeight: 800, letterSpacing: ".035em" }}>TOMORROW’S TECH <span style={{ color: "#20a4ff" }}>AI</span></div>
              <div style={{ fontSize: Math.round(titleSize * .105), color: "#68c7ff", letterSpacing: ".12em" }}>WEBSITES • SYSTEMS • AI • A BRIGHTER TOMORROW</div>
            </div>
          </div>
          {!portrait && <div style={{ color: "#56c0ff", fontSize: Math.round(titleSize * .22), fontWeight: 700, letterSpacing: ".1em", textAlign: "right", maxWidth: "25%" }}>BUILD SMARTER.<br />GROW FASTER.</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: portrait ? "88%" : "57%", gap: Math.round(pad * .24) }}>
          <div style={{ fontSize: Math.round(titleSize * .25), color: "#4ab7ff", fontWeight: 700, letterSpacing: ".21em" }}>{snapshot.kind === "package" ? "BUSINESS PACKAGE" : "SERVICE SPOTLIGHT"}</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: titleSize, lineHeight: .93, fontWeight: 900, letterSpacing: "-.035em", textTransform: "uppercase" }}>
            {fit(brief.headline, portrait ? 48 : 42)}
          </div>
          <div style={{ fontSize: Math.round(titleSize * .34), lineHeight: 1.25, color: "#d9e5f4", maxWidth: "92%" }}>{fit(brief.subheadline, compact ? 100 : 145)}</div>
          {!compact && <div style={{ display: "flex", flexDirection: "column", gap: Math.round(pad * .15), marginTop: Math.round(pad * .12) }}>
            {features.map((feature) => <div key={feature} style={{ display: "flex", alignItems: "center", gap: Math.round(pad * .18), fontSize: Math.round(titleSize * .27) }}><span style={{ width: Math.round(titleSize * .34), height: Math.round(titleSize * .34), display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 999, background: "#169cff", fontWeight: 900, fontSize: Math.round(titleSize * .2) }}>✓</span>{fit(feature, 55)}</div>)}
          </div>}
        </div>

        <div style={{ display: "flex", alignItems: "stretch", gap: Math.round(pad * .3), width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minWidth: compact ? "24%" : "27%", border: `${Math.max(2, Math.round(width / 500))}px solid #159dff`, borderRadius: Math.round(pad * .22), padding: `${Math.round(pad * .16)}px ${Math.round(pad * .3)}px`, background: "rgba(0,7,18,.86)" }}>
            <div style={{ fontSize: Math.round(titleSize * .56), fontWeight: 900 }}>{priceMain}</div>
            <div style={{ fontSize: Math.round(titleSize * .18), fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase" }}>{snapshot.price.includes("/month") ? "PER MONTH" : snapshot.price.includes("Custom") ? "LET’S TALK" : "ONE TIME"}</div>
          </div>
          <div style={{ width: 2, background: "#238ed0", margin: `${Math.round(pad * .12)}px 0` }} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: Math.round(pad * .2), background: "linear-gradient(90deg,#087ef5,#14adff)", fontSize: Math.round(titleSize * .35), fontWeight: 800, letterSpacing: ".025em", textTransform: "uppercase" }}>{fit(brief.cta, 30)} →</div>
        </div>
      </div>
    </div>,
    { width, height }
  );
  return Buffer.from(await response.arrayBuffer());
}
