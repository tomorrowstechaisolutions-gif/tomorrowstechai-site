import type { SoundBed } from "./soundPlan";

/**
 * The sounds Tess makes besides her voice, all made in the browser (no audio
 * files): a slow drifting hum with the odd soft chime while she is in her own
 * world, a quick light patter while she thinks, and a chirp up and down as
 * she starts and stops listening.
 *
 * Everything is quiet by design. Tune the numbers below to taste.
 */

const LEVEL = 0.9; // overall loudness of the effects
const CHIME_NOTES = [440, 523.25, 587.33, 659.25, 783.99, 880]; // A minor pentatonic
const THINK_NOTES = [659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

export type TessSounds = {
  setBed(bed: SoundBed): void;
  chirp(direction: "up" | "down"): void;
  setOn(on: boolean): void;
  dispose(): void;
};

export function createTessSounds(ctx: AudioContext): TessSounds {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // Her own world: two soft notes a fifth apart, slowly swelling.
  const idle = ctx.createGain();
  idle.gain.value = 0;
  const warm = ctx.createBiquadFilter();
  warm.type = "lowpass";
  warm.frequency.value = 900;
  const breath = ctx.createGain();
  breath.gain.value = 0.65;
  warm.connect(breath).connect(idle);
  idle.connect(master);
  const running: OscillatorNode[] = [];
  for (const [freq, level] of [
    [220, 0.05],
    [329.63, 0.035],
    [221.2, 0.03],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(warm);
    osc.start();
    running.push(osc);
  }
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.08;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 0.35;
  swell.connect(swellDepth).connect(breath.gain);
  swell.start();
  running.push(swell);

  // Thinking: a low shimmer under the patter.
  const think = ctx.createGain();
  think.gain.value = 0;
  think.connect(master);
  const shimmer = ctx.createOscillator();
  shimmer.type = "triangle";
  shimmer.frequency.value = 330;
  const shimmerLevel = ctx.createGain();
  shimmerLevel.gain.value = 0.03;
  const flutter = ctx.createOscillator();
  flutter.frequency.value = 6;
  const flutterDepth = ctx.createGain();
  flutterDepth.gain.value = 0.02;
  flutter.connect(flutterDepth).connect(shimmerLevel.gain);
  shimmer.connect(shimmerLevel).connect(think);
  shimmer.start();
  flutter.start();
  running.push(shimmer, flutter);

  /** One short note with a soft start and a fading tail. */
  const note = (freq: number, peak: number, tail: number, type: OscillatorType = "sine", glideTo?: number) => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, now + tail * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + tail);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + tail + 0.05);
  };

  let bed: SoundBed = "none";
  let on = false;
  let nextChime = 0;
  let nextThink = 0;
  let step = 0;

  const timer = window.setInterval(() => {
    if (!on || ctx.state !== "running") return;
    const now = performance.now();
    if (bed === "idle" && now >= nextChime) {
      const freq = CHIME_NOTES[Math.floor(Math.random() * CHIME_NOTES.length)];
      note(freq, 0.05, 2.8);
      note(freq * 2, 0.012, 1.6);
      nextChime = now + 3500 + Math.random() * 5000;
    }
    if (bed === "thinking" && now >= nextThink) {
      const skip = Math.random() < 0.25 ? 2 : 1;
      step = (step + skip) % THINK_NOTES.length;
      note(THINK_NOTES[step], 0.03, 0.11, "triangle");
      nextThink = now + 120 + Math.random() * 90;
    }
  }, 60);

  const fade = (param: AudioParam, to: number, seconds: number) => {
    param.cancelScheduledValues(ctx.currentTime);
    param.setTargetAtTime(to, ctx.currentTime, seconds);
  };

  return {
    setBed(next) {
      if (next === bed) return;
      bed = next;
      fade(idle.gain, bed === "idle" ? 1 : 0, bed === "idle" ? 1.2 : 0.12);
      fade(think.gain, bed === "thinking" ? 1 : 0, 0.15);
      if (bed === "idle") nextChime = performance.now() + 1500;
      if (bed === "thinking") nextThink = performance.now() + 150;
    },
    chirp(direction) {
      if (!on || ctx.state !== "running") return;
      if (direction === "up") note(520, 0.09, 0.18, "sine", 1040);
      else note(880, 0.08, 0.2, "sine", 440);
    },
    setOn(next) {
      on = next;
      fade(master.gain, on ? LEVEL : 0, 0.08);
    },
    dispose() {
      window.clearInterval(timer);
      for (const osc of running) {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      }
      master.disconnect();
    },
  };
}
