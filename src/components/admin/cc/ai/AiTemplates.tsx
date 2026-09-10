"use client";

import { useEffect, useState, useTransition } from "react";
import { createFromTemplateAction } from "@/app/admin/ai-actions";
import { IconFile, IconX } from "../Icons";
import { TOOL_LABELS, type ToolKey } from "@/lib/ai/types";

export type TemplateCard = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  typeLabel: string;
  default_tools: string[];
  knowledge_requirements: string[];
};

/**
 * The template library.
 *
 * Everything built from a template arrives as a DRAFT with its prompt saved
 * as an unactivated version. A template is a starting point, and a starting
 * point that goes live the moment you click it is a way to put an
 * unreviewed assistant in front of a client.
 */
export default function AiTemplates({
  templates,
  clients,
}: {
  templates: TemplateCard[];
  clients: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<TemplateCard | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setChosen(null); setOpen(false); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="cc-btn" onClick={() => setOpen(true)}>
        <IconFile size={15} />
        <span>AI Templates</span>
        <span className="cc-tab-n">{templates.length}</span>
      </button>

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(event) => { if (event.target === event.currentTarget) { setChosen(null); setOpen(false); } }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="AI templates">
            <div className="cc-sheet-head">
              <IconFile size={17} />
              <h3>{chosen ? `New from “${chosen.name}”` : "AI templates"}</h3>
              <button
                type="button"
                className="cc-icon-btn"
                style={{ marginLeft: "auto", width: 28, height: 28 }}
                onClick={() => { setChosen(null); setOpen(false); }}
                aria-label="Close"
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="cc-sheet-body">
              {chosen ? (
                <form action={(fd) => startTransition(async () => { await createFromTemplateAction(fd); })}>
                  <input type="hidden" name="template_id" value={chosen.id} />

                  <p className="cc-note" style={{ marginTop: 0 }}>{chosen.description}</p>

                  <div className="cc-field">
                    <label className="cc-label" htmlFor="tpl-name">Name it</label>
                    <input id="tpl-name" name="name" className="cc-input" autoFocus defaultValue={chosen.name} required />
                  </div>

                  <div className="cc-field">
                    <label className="cc-label" htmlFor="tpl-client">Client</label>
                    <select id="tpl-client" name="customer_id" className="cc-select" defaultValue="">
                      <option value="">Ours — internal</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {chosen.default_tools.length > 0 ? (
                    <>
                      <p className="cc-subhead">Tools it starts with</p>
                      <div className="cc-taglist">
                        {chosen.default_tools.map((tool) => (
                          <span className="cc-chip t-muted" key={tool}>
                            {TOOL_LABELS[tool as ToolKey] ?? tool}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {chosen.knowledge_requirements.length > 0 ? (
                    <>
                      <p className="cc-subhead">Knowledge it needs before it is useful</p>
                      <ul className="cc-taglist" style={{ display: "block" }}>
                        {chosen.knowledge_requirements.map((req) => (
                          <li key={req} className="cc-note" style={{ marginTop: 2 }}>· {req}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  <p className="cc-note">
                    It will be created as a <strong>draft</strong>, with its prompt saved
                    but not activated, and with every tool still requiring approval.
                    Review it before you turn it on.
                  </p>

                  <div className="cc-sheet-foot">
                    <button type="button" className="cc-btn" onClick={() => setChosen(null)}>Back</button>
                    <button type="submit" className="cc-btn primary" disabled={pending}>
                      {pending ? "Creating…" : "Create draft"}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="cc-note" style={{ marginTop: 0 }}>
                    Starting points for common AI systems. Each one sets a type, a
                    starting prompt and a least-privilege tool set.
                  </p>
                  <ul className="cc-health">
                    {templates.map((template) => (
                      <li className="cc-health-row" key={template.id}>
                        <div className="cc-health-name">{template.name}</div>
                        <div className="cc-health-detail">{template.description}</div>
                        <span className="cc-chip t-muted">{template.typeLabel}</span>
                        <button type="button" className="cc-btn is-sm" onClick={() => setChosen(template)}>
                          Use
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
