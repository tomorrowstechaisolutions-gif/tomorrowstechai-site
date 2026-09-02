"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCEPTANCE_CHECKS } from "@/lib/proposals/config";

/**
 * Acceptance and signature.
 *
 * The button is disabled until every confirmation is ticked, but that is a
 * courtesy rather than a control: the route handler re-checks all four, and a
 * database constraint refuses a signature row that is missing any of them.
 *
 * No amount is posted. The server reads what is owed from the proposal.
 */
export default function AcceptForm({
  token,
  defaultName,
  defaultEmail,
  defaultTitle,
  dueLabel,
}: {
  token: string;
  defaultName: string;
  defaultEmail: string;
  defaultTitle: string;
  dueLabel: string;
}) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [title, setTitle] = useState(defaultTitle);
  const [typed, setTyped] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = ACCEPTANCE_CHECKS.every((check) => checks[check.key]);
  const hasMark = mode === "typed" ? typed.trim().length >= 2 : hasDrawn;
  const ready = allChecked && name.trim().length >= 2 && email.includes("@") && hasMark && !busy;

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const element = canvas.current;
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * element.width,
      y: ((event.clientY - box.top) / box.height) * element.height,
    };
  };

  const startDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = canvas.current?.getContext("2d");
    const at = point(event);
    if (!context || !at) return;
    drawing.current = true;
    context.strokeStyle = "#e8eef7";
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(at.x, at.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvas.current?.getContext("2d");
    const at = point(event);
    if (!context || !at) return;
    context.lineTo(at.x, at.y);
    context.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => { drawing.current = false; };

  const clearDrawing = () => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (element && context) context.clearRect(0, 0, element.width, element.height);
    setHasDrawn(false);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/proposal/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signer_name: name,
          signer_email: email,
          signer_title: title,
          signature_type: mode,
          signature_text: mode === "typed" ? typed : null,
          signature_data: mode === "drawn" ? canvas.current?.toDataURL("image/png") ?? null : null,
          confirmations: checks,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        checkout_url?: string | null;
      };

      if (!response.ok) {
        setError(body.error ?? "That did not go through. Please try again.");
        setBusy(false);
        return;
      }
      if (body.checkout_url) {
        window.location.href = body.checkout_url;
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong sending that. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <section id="accept" className="pr-block pr-accept">
      <div className="pr-head"><span>09</span><h2>Accept &amp; sign</h2></div>

      <p className="pr-note">
        Please confirm each of these. Every one has to be ticked before the
        agreement can be signed.
      </p>

      <ul className="pr-checks">
        {ACCEPTANCE_CHECKS.map((check) => (
          <li key={check.key}>
            <label>
              <input
                type="checkbox"
                checked={Boolean(checks[check.key])}
                onChange={(e) =>
                  setChecks((prev) => ({ ...prev, [check.key]: e.target.checked }))
                }
              />
              <span>{check.label}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="pr-signfields">
        <label>
          <span>Full legal name</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (mode === "typed") setTyped(e.target.value);
            }}
            autoComplete="name"
            placeholder="Jane Doe"
          />
        </label>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="jane@business.com"
          />
        </label>
        <label>
          <span>Title or role <i>(optional)</i></span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Owner"
          />
        </label>
      </div>

      <div className="pr-sigbox">
        <div className="pr-sigtabs">
          <button type="button" className={mode === "typed" ? "is-on" : ""} onClick={() => setMode("typed")}>
            Type it
          </button>
          <button type="button" className={mode === "drawn" ? "is-on" : ""} onClick={() => setMode("drawn")}>
            Draw it
          </button>
        </div>

        {mode === "typed" ? (
          <>
            <input
              className="pr-sigtype"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type your name"
              aria-label="Typed signature"
            />
            <p className="pr-note">
              Typing your name here is your electronic signature and is legally
              binding, in the same way as signing on paper.
            </p>
          </>
        ) : (
          <>
            <canvas
              ref={canvas}
              width={640}
              height={180}
              className="pr-sigpad"
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              aria-label="Draw your signature"
            />
            <button type="button" className="pr-clear" onClick={clearDrawing}>Clear</button>
          </>
        )}
      </div>

      {error ? <p className="pr-error">{error}</p> : null}

      <button type="button" className="pr-submit" disabled={!ready} onClick={submit}>
        {busy ? "Recording your signature…" : `Accept and sign${dueLabel ? ` — ${dueLabel}` : ""}`}
      </button>

      <p className="pr-note">
        Your name, email, the time, your IP address and the exact agreement
        version are recorded with the signature, and a frozen copy of this
        document is stored against it.
      </p>
    </section>
  );
}
