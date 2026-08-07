import { generateConcepts } from "@/lib/logo-studio/generate";
import { renderLogoSvg } from "@/lib/logo-studio/render";
import type { Brief } from "@/lib/logo-studio/types";

/**
 * Hero device mock for the Logo Studio landing page.
 *
 * The sample marks are produced by the real generator rather than drawn by
 * hand, so this screenshot can never drift from what the tool actually makes —
 * and every visitor is looking at genuine output. Rendered on the server: it is
 * deterministic, so there is nothing to hydrate.
 */

const SAMPLES: { name: string; descriptor: string; industryId: string; styles: string[]; paletteId: string }[] = [
  { name: "Nexora", descriptor: "Solutions", industryId: "tech", styles: ["modern", "minimal"], paletteId: "voltage" },
  { name: "Elevate", descriptor: "Performance", industryId: "fitness", styles: ["bold", "futuristic"], paletteId: "midnight" },
  { name: "Zenith", descriptor: "Industries", industryId: "construction", styles: ["industrial", "bold"], paletteId: "ironclad" },
  { name: "Pivot", descriptor: "Consulting", industryId: "legal", styles: ["professional", "premium"], paletteId: "midnight" },
  { name: "Northline", descriptor: "Builders", industryId: "roofing", styles: ["modern", "professional"], paletteId: "voltage" },
  { name: "Stryde", descriptor: "Technologies", industryId: "tech", styles: ["futuristic", "modern"], paletteId: "signal" },
];

function sampleSvg(s: (typeof SAMPLES)[number], slot: number) {
  const brief: Brief = {
    businessName: s.name,
    descriptor: s.descriptor,
    industryId: s.industryId,
    styles: s.styles,
    paletteId: s.paletteId,
    usage: ["website"],
    layout: "stacked",
  };
  const concepts = generateConcepts(brief, 0);
  const c = concepts[slot % concepts.length];
  return renderLogoSvg(c, brief, { ns: `hero-${s.name.toLowerCase()}`, palette: c.palette });
}

export function StudioPreview() {
  return (
    <div className="relative">
      {/* ambient pool */}
      <div
        className="absolute inset-x-[6%] top-[12%] bottom-[16%] blur-3xl opacity-60 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(59,130,246,.28), transparent 70%)" }}
      />

      {/* monitor */}
      <div className="relative rounded-xl border border-[#2a3340] bg-[#0a0e15] shadow-[0_40px_90px_-40px_rgba(0,0,0,.9)] overflow-hidden">
        <div className="h-7 border-b border-white/[0.07] flex items-center gap-1.5 px-3">
          {["#ef4444", "#eab308", "#22c55e"].map((c) => (
            <span key={c} className="w-2 h-2 rounded-full" style={{ background: c }} />
          ))}
          <span className="ml-3 text-[9.5px] font-semibold tracking-[0.16em] uppercase text-white/35">
            Tomorrow&rsquo;s Tech · Logo Studio
          </span>
        </div>

        <div className="grid grid-cols-[104px_minmax(0,1fr)] sm:grid-cols-[132px_minmax(0,1fr)]">
          {/* steps rail */}
          <div className="border-r border-white/[0.07] p-2.5 space-y-1">
            {[
              ["1", "Your business"],
              ["2", "Style & vibe"],
              ["3", "Concepts"],
            ].map(([n, label], i) => (
              <div
                key={n}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[9.5px] ${
                  i === 2 ? "bg-[rgba(59,130,246,.16)] text-[color:var(--color-blue-bright)]" : "text-white/45"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold shrink-0 ${
                    i === 2 ? "bg-[color:var(--color-blue)] text-white" : "bg-white/10"
                  }`}
                >
                  {i < 2 ? "✓" : n}
                </span>
                <span className="truncate">{label}</span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-white/[0.07] space-y-1.5">
              {["Modern", "Bold", "Trustworthy", "Innovative"].map((t) => (
                <div key={t} className="text-[8.5px] text-white/30 px-2">
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* concept grid */}
          <div className="p-3">
            <div className="text-[9.5px] font-semibold tracking-[0.16em] uppercase text-white/40 mb-2.5">
              Your logo concepts
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SAMPLES.map((s, i) => (
                <div
                  key={s.name}
                  className="rounded-md border border-white/[0.09] bg-[#0d121b] aspect-[4/3] grid place-items-center p-2.5"
                >
                  <span
                    className="mk-svg block w-full"
                    dangerouslySetInnerHTML={{ __html: sampleSvg(s, i) }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-center">
              <span className="text-[9px] font-semibold tracking-[0.12em] uppercase rounded-md border border-white/15 px-3 py-1.5 text-white/55">
                Generate more concepts
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* monitor stand */}
      <div className="mx-auto w-[16%] h-5 bg-gradient-to-b from-[#1c232e] to-[#11161d]" />
      <div className="mx-auto w-[34%] h-1.5 rounded-full bg-[#1c232e]" />
    </div>
  );
}
