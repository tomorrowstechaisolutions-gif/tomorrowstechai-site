"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  VisualAppDev,
  VisualAutomation,
  VisualCommandCenter,
  VisualLocalAI,
  VisualPMO,
  VisualSmartsheet,
  VisualVideo,
  VisualWebsite,
  VisualWorkflow,
} from "./ServiceVisuals";

type Service = {
  tag: string;
  title: string;
  body: string;
  Visual: ComponentType;
  includes: string[];
  timeline: string;
  price?: string;
};

const services: Service[] = [
  {
    tag: "01",
    title: "AI Command Centers",
    body: "Smartsheet workflows, crew/fleet/compliance dashboards, real-time visibility across departments. One source of truth your executives can actually trust. Built field-up, not boardroom-down.",
    Visual: VisualCommandCenter,
    includes: [
      "Discovery of every sheet, spreadsheet, and clipboard your data currently lives on",
      "One Smartsheet-backed source of truth with role-based views for field, ops, and exec",
      "Live dashboards: crew status, fleet readiness, compliance expirations, job progress",
      "Automated alerts that fire before something expires, not after",
    ],
    timeline: "4–8 weeks to your first live dashboard",
    price: "$5,000–$15,000",
  },
  {
    tag: "02",
    title: "Smartsheet Consulting & Build-out",
    body: "From contractor master sheets with scheduling violation detection to PMO governance templates that scale across projects. P6-style scheduling rigor translated into Smartsheet-native systems.",
    Visual: VisualSmartsheet,
    includes: [
      "Contractor master sheets with automatic scheduling-violation detection",
      "PMO governance templates that hold up across dozens of concurrent projects",
      "Cross-sheet formulas, workflows, and approval chains that don't break when someone adds a column",
      "Training so your team runs it without calling us every week",
    ],
    timeline: "2–6 weeks depending on sheet count",
    price: "$5,000–$15,000",
  },
  {
    tag: "03",
    title: "Custom AI Workflow Design",
    body: "AI workflows built around how your business actually works, not how generic tools think it should. Smartsheet-first, Claude-enabled, field-tested. Operations first, AI second.",
    Visual: VisualWorkflow,
    includes: [
      "A map of how the work actually moves today — including the workarounds nobody documented",
      "Claude-enabled workflows wired into Smartsheet, email, and the tools you already pay for",
      "Explicit propose-vs-act boundaries: where AI drafts, where a human signs off",
      "A read-only proving period so you trust the answers before anything gets write access",
    ],
    timeline: "3–6 weeks per workflow",
    price: "$5,000–$15,000",
  },
  {
    tag: "04",
    title: "Custom AI App Development",
    body: "TypeScript + Next.js + Vercel + Neon. The same stack we use to build Held. Production-ready apps for internal operations, customer portals, or net-new products.",
    Visual: VisualAppDev,
    includes: [
      "TypeScript + Next.js + Vercel + Neon — the stack behind our production apps",
      "Auth, roles, and audit trails built in from day one, not bolted on later",
      "Staging and production environments on your own domain",
      "The source code is yours. No platform lock-in, no per-seat tax",
    ],
    timeline: "6–12 weeks to production",
  },
  {
    tag: "05",
    title: "Local AI Deployment",
    body: "NexaFlow AI-style: local LLM platforms that run on your machine. Online or offline, your data stays private. No training someone else's models on your operational secrets.",
    Visual: VisualLocalAI,
    includes: [
      "An LLM platform installed on your hardware — desktop, workstation, or on-prem server",
      "Runs offline. Nothing leaves the building, ever",
      "Document and chat interface tuned to your operational vocabulary",
      "Hardware sizing guidance and a model update path you control",
    ],
    timeline: "1–3 weeks",
  },
  {
    tag: "06",
    title: "Operations Automation",
    body: "Field-to-office workflows that start with crews capturing information on their phone and flow through operations, reporting, approvals, billing, and customer invoicing.",
    Visual: VisualAutomation,
    includes: [
      "Mobile capture forms simple enough that crews fill them out on a cracked screen in the rain",
      "Automatic routing through ops review, approval, and billing",
      "Invoices and reports generated from field data instead of retyped from it",
      "Exception alerts the moment something stalls in the chain",
    ],
    timeline: "3–8 weeks per workflow chain",
  },
  {
    tag: "07",
    title: "Program Management Consulting",
    body: "Drawing on 18 years running real telecom and infrastructure programs. We help leadership teams design PMO structures, scheduling discipline, and operational governance.",
    Visual: VisualPMO,
    includes: [
      "PMO structure, roles, and cadence designed around how your programs really run",
      "Scheduling discipline — baselines, float, look-aheads — translated out of P6 into tools your team will actually open",
      "Governance, reporting rhythm, and escalation paths leadership will actually read",
      "Coaching for your PMs and schedulers. Not a binder that sits on a shelf",
    ],
    timeline: "4–12 weeks, or an ongoing retainer",
  },
  {
    tag: "08",
    title: "Website Design & Build",
    body: "Custom-coded business websites on Next.js + Vercel — the same modern stack powering our own site. Fast, secure, SEO-ready out of the box, mobile-first by default. Not WordPress. Not a drag-and-drop builder. Two ways in: the $399 Business Launch package if you need to be online in two weeks, or a custom build when the design and the words have to be yours.",
    Visual: VisualWebsite,
    includes: [
      "Custom-coded on Next.js + Vercel. Not WordPress, not a page builder",
      "SEO foundation: sitemap, structured data, canonical URLs, social preview images",
      "Mobile-first, sub-second load, accessible by default",
      "Contact forms, booking, blog, and analytics wired up before launch day",
      "$399 Business Launch: five pages on a proven layout, live in 7–14 days",
      "Custom build: your design, your copy, as many pages as the business needs",
    ],
    timeline: "$399 package: 7–14 days · Custom: 2–4 weeks",
    price: "$399 package · $1,500–$3,000 custom",
  },
  {
    tag: "09",
    title: "Video Production & Brand Content",
    body: "Promotional videos for your business, social ads, and brand storytelling. The same content stack we shipped for The Field House Gym — used on their site and across ad campaigns at both locations.",
    Visual: VisualVideo,
    includes: [
      "Concept, shot list, and on-site production",
      "Edit, color, captions, and licensed music",
      "Delivered in web, vertical social, and paid-ad cuts",
      "The same stack we shipped for The Field House Gym, live on their site and in their ads",
    ],
    timeline: "2–4 weeks per production",
  },
];

function ServiceCard({ service }: { service: Service }) {
  const [open, setOpen] = useState(false);
  const panelId = `${useId()}-panel`;
  const { Visual } = service;

  return (
    <div className="svc-card group relative" data-open={open}>
      <div className="svc-visual">
        <Visual />
      </div>

      <div className="p-6">
        <div className="flex items-start gap-4 mb-3">
          <span className="font-mono text-[color:var(--color-cyan)] text-sm tracking-widest shrink-0 pt-[5px]">
            {service.tag}
          </span>
          <h2 className="text-xl font-medium leading-snug">
            <button
              type="button"
              className="svc-trigger"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
            >
              {service.title}
            </button>
          </h2>
        </div>

        <p className="text-[color:var(--color-text-secondary)] leading-relaxed text-[15px]">
          {service.body}
        </p>

        <div className="mt-5 flex items-center gap-2 font-mono text-[11px] tracking-widest uppercase text-[color:var(--color-text-muted)] group-hover:text-[color:var(--color-cyan)] transition-colors">
          <span>{open ? "Close" : "What's included"}</span>
          <svg
            viewBox="0 0 12 12"
            className={`w-3 h-3 transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            <path
              d="M2 4.5 L6 8.5 L10 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      <div id={panelId} className="svc-panel" data-open={open} aria-hidden={!open}>
        <div>
          <div className="mx-6 border-t border-[color:var(--color-border)] pt-5 pb-6">
            <ul className="space-y-2.5">
              {service.includes.map((item) => (
                <li
                  key={item}
                  className="relative pl-6 text-[14px] leading-relaxed text-[color:var(--color-text-secondary)]"
                >
                  <span className="absolute left-0 top-0 font-mono text-[color:var(--color-cyan)]">
                    →
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-widest uppercase">
              <span className="text-[color:var(--color-text-muted)]">
                Timeline{" "}
                <span className="text-[color:var(--color-text)] normal-case tracking-normal font-sans text-[13px]">
                  {service.timeline}
                </span>
              </span>
              {service.price && (
                <span className="text-[color:var(--color-text-muted)]">
                  Typically{" "}
                  <span className="text-[color:var(--color-cyan)] normal-case tracking-normal font-sans text-[13px]">
                    {service.price}
                  </span>
                </span>
              )}
            </div>

            <Link
              href="/contact"
              tabIndex={open ? 0 : -1}
              className="inline-flex items-center gap-2 mt-5 text-sm text-[color:var(--color-cyan)] border-b border-[color:var(--color-cyan)]/30 hover:border-[color:var(--color-cyan)] pb-0.5 transition-colors"
            >
              Talk through this one →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ServicesGrid() {
  return (
    <div className="grid md:grid-cols-2 gap-5 items-start">
      {services.map((s) => (
        <ServiceCard key={s.tag} service={s} />
      ))}
    </div>
  );
}
