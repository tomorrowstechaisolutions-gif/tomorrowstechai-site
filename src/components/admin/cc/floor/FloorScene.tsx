"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StationId } from "@/lib/crew/stations";
import type { CameraMode, FloorHandle } from "./floor-engine";
import FloorSide, { type SideBot } from "./FloorSide";
import { floorFeed, lastShift, replayDelays, type FloorStep } from "./replay";
import styles from "./floor.module.css";

/**
 * The floor, live. It asks the server every three seconds for steps it has
 * not seen and hands each one to the scene, so a robot moves only because a
 * bot really did something. Steps older than a minute and a half when the
 * page opens go straight to the log without being acted out.
 *
 * "Replay last shift" plays the most recent finished shift back at its
 * recorded pace under a banner that says it is a replay and when it really
 * happened. Live steps that arrive meanwhile wait until the replay ends.
 */

export type FloorAgent = { id: string; slug: string; name: string; rank: string; desk: string | null; paused: boolean };
export type FloorData = { steps: FloorStep[]; agents: FloorAgent[]; stations: StationId[]; working: string[]; now: string };

const POLL_MS = 3000;
const FRESH_MS = 90_000;
const ROLE: Record<string, string> = {
  "follow-through": "Sales desk · makes sure no lead goes quiet",
  content: "Social desk · posts from published articles",
  finance: "Finance · keeps money owed from going unpaid",
};
const COLOR: Record<string, string> = { "follow-through": "#4be3a0", content: "#ff7ab8", finance: "#ffb347", tess: "#35d6ff" };

async function fetchFloor(since: string | null): Promise<FloorData> {
  const res = await fetch(`/api/admin/crew/steps${since ? `?since=${encodeURIComponent(since)}` : ""}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "The floor could not be loaded.");
  }
  return (await res.json()) as FloorData;
}

function shiftTime(steps: FloorStep[]): string {
  if (!steps.length) return "";
  const start = new Date(steps[0].created_at);
  const end = new Date(steps[steps.length - 1].created_at);
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time(start)} to ${time(end)}`;
}

export default function FloorScene({ load = fetchFloor }: { load?: (since: string | null) => Promise<FloorData> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engine = useRef<FloorHandle | null>(null);
  const seen = useRef(new Set<string>());
  const held = useRef<FloorStep[]>([]);
  const replaying = useRef(false);
  const timers = useRef<number[]>([]);

  const [first, setFirst] = useState<FloorData | null>(null);
  const [agents, setAgents] = useState<FloorAgent[]>([]);
  const [working, setWorking] = useState<string[]>([]);
  const [steps, setSteps] = useState<FloorStep[]>([]);
  const [activity, setActivity] = useState<Record<string, string | null>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraMode>("orbit");
  const [banner, setBanner] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const play = useCallback((fresh: FloorStep[]) => {
    for (const move of floorFeed(fresh)) engine.current?.enqueue(move);
  }, []);

  // First load: who the crew are, which stations exist, and the last day's log.
  useEffect(() => {
    let alive = true;
    load(null)
      .then((data) => {
        if (!alive) return;
        for (const s of data.steps) seen.current.add(s.id);
        setFirst(data);
        setAgents(data.agents);
        setWorking(data.working);
        setSteps(data.steps);
        setSelected(data.agents.find((a) => a.slug !== "tess")?.id ?? null);
      })
      .catch((err: unknown) => alive && setProblem(err instanceof Error ? err.message : "The floor could not be loaded."));
    return () => {
      alive = false;
    };
  }, [load]);

  // Build the scene once the crew is known, then keep it fed.
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!first || !canvas || !overlay) return;
    let alive = true;
    let poll = 0;
    let latest = first.steps[first.steps.length - 1]?.created_at ?? first.now;

    void import("./floor-engine")
      .then(({ createFloor }) => {
        if (!alive) return;
        const crew = first.agents.filter((a) => a.slug !== "tess");
        try {
          engine.current = createFloor(canvas, overlay, {
            bots: crew.map((a) => ({ id: a.id, slug: a.slug, name: a.name, awake: !a.paused })),
            stations: first.stations,
            leadId: first.agents.find((a) => a.slug === "tess")?.id ?? null,
            onSelect: setSelected,
            onActivity: setActivity,
          });
        } catch {
          setProblem("This browser could not start the 3D view. The log on the right still shows everything the crew does.");
          return;
        }
        // Act out only what just happened; older steps are already in the log.
        const cutoff = Date.parse(first.now) - FRESH_MS;
        play(first.steps.filter((s) => Date.parse(s.created_at) >= cutoff));

        poll = window.setInterval(() => {
          if (document.hidden) return;
          load(latest)
            .then((data) => {
              if (!alive) return;
              const fresh = data.steps.filter((s) => !seen.current.has(s.id));
              for (const s of fresh) seen.current.add(s.id);
              if (fresh.length) {
                latest = fresh[fresh.length - 1].created_at;
                setSteps((prev) => [...prev, ...fresh].slice(-400));
                if (replaying.current) held.current.push(...fresh);
                else play(fresh);
              }
              setAgents(data.agents);
              setWorking(data.working);
              for (const a of data.agents) engine.current?.setAwake(a.id, !a.paused);
              setProblem(null);
            })
            .catch(() => undefined); // A missed poll is not worth a message; the next one catches up.
        }, POLL_MS);
      })
      .catch(() => setProblem("The 3D view could not be loaded. The log on the right still shows everything the crew does."));

    const pending = timers.current;
    return () => {
      alive = false;
      window.clearInterval(poll);
      for (const id of pending) window.clearTimeout(id);
      pending.length = 0;
      engine.current?.dispose();
      engine.current = null;
    };
  }, [first, load, play]);

  useEffect(() => {
    if (selected) engine.current?.select(selected);
  }, [selected]);
  useEffect(() => {
    engine.current?.setCamera(camera);
  }, [camera]);

  const shift = useMemo(() => lastShift(steps), [steps]);

  const replay = useCallback(() => {
    if (!engine.current || replaying.current || !shift.length) return;
    const feed = floorFeed(shift);
    const delays = replayDelays(feed);
    const who = agents.find((a) => a.id === shift[0].agent_id)?.name ?? "A bot";
    replaying.current = true;
    engine.current.clear();
    setSelected(shift[0].agent_id);
    setBanner(`Replay · ${who} · ${shiftTime(shift)}`);

    let at = 600;
    feed.forEach((move, i) => {
      at += delays[i];
      timers.current.push(window.setTimeout(() => engine.current?.enqueue(move), at));
    });
    timers.current.push(
      window.setTimeout(() => {
        replaying.current = false;
        setBanner(null);
        const waiting = held.current;
        held.current = [];
        play(waiting);
      }, at + 7000)
    );
  }, [agents, play, shift]);

  const names = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, { name: a.name, color: COLOR[a.slug] ?? "#35d6ff" }])), [agents]);
  const crew = agents.filter((a) => a.slug !== "tess");
  const dayAgo = useMemo(() => (first ? Date.parse(first.now) - 24 * 3_600_000 : 0), [first]);
  const recent = useMemo(() => steps.filter((s) => Date.parse(s.created_at) >= dayAgo), [steps, dayAgo]);
  const count = (kind: string) => recent.filter((s) => s.kind === kind).length;
  const emails = recent.filter((s) => s.kind === "act" && s.station === "inbox").length;

  const sideBot: SideBot | null = useMemo(() => {
    const bot = crew.find((a) => a.id === selected);
    if (!bot) return null;
    const mine = recent.filter((s) => s.agent_id === bot.id);
    const last = [...mine].reverse().find((s) => s.kind !== "read");
    const doing = activity[bot.id];
    return {
      id: bot.id,
      name: bot.name,
      role: ROLE[bot.slug] ?? "Crew",
      color: COLOR[bot.slug] ?? "#35d6ff",
      status: doing ?? (bot.paused ? "Paused by you" : working.includes(bot.id) ? "On a shift" : "Waiting for its next shift"),
      last: last?.summary ?? null,
      actions: mine.filter((s) => s.kind === "act").length,
      refused: mine.filter((s) => s.kind === "refused").length,
    };
  }, [activity, crew, recent, selected, working]);

  const log = useMemo(() => [...steps].reverse().slice(0, 40), [steps]);
  const out = Object.values(activity).filter(Boolean).length;

  return (
    <div className={styles.root}>
      <div className={styles.world}>
        <canvas ref={canvasRef} aria-label="The crew floor: a 3D view of the bots at their stations" />
      </div>
      <div ref={overlayRef} className={styles.overlay} />

      <div className={styles.top}>
        <Link href="/admin/ai" className={styles.back}>
          ← Tess
        </Link>
        <span className={styles.name}>The floor</span>
        <span className={styles.chip}>
          On the floor <b>{out}</b> of {crew.length}
        </span>
        <span className={styles.chip}>
          Done · 24h <b>{count("act")}</b>
        </span>
        <span className={styles.chip}>
          Emails sent · 24h <b>{emails}</b>
        </span>
        <span className={styles.chip}>
          Stopped · 24h <b>{count("refused")}</b>
        </span>
        <span className={styles.chip}>
          For you · 24h <b>{count("needs_john")}</b>
        </span>
        <span className={styles.spacer} />
        <button type="button" className={styles.btn} onClick={replay} disabled={!shift.length || Boolean(banner) || !first}>
          Replay last shift
        </button>
      </div>

      {banner ? (
        <div className={styles.banner} role="status">
          {banner}
        </div>
      ) : null}
      {problem ? <div className={styles.notice}>{problem}</div> : null}

      {first ? <FloorSide bot={sideBot} log={log} names={names} /> : null}

      <div className={styles.cam} role="group" aria-label="Camera">
        {(["orbit", "top", "follow"] as const).map((mode) => (
          <button key={mode} type="button" className={styles.btn} aria-pressed={camera === mode} onClick={() => setCamera(mode)}>
            {mode === "orbit" ? "Orbit" : mode === "top" ? "Overview" : "Follow selected"}
          </button>
        ))}
        {crew.map((bot) => (
          <button key={bot.id} type="button" className={styles.btn} aria-pressed={selected === bot.id} onClick={() => setSelected(bot.id)}>
            {bot.name}
          </button>
        ))}
      </div>
      <div className={styles.hint}>Click a bot, or pick one above, to select it. A bot only moves when it really did something.</div>
    </div>
  );
}
