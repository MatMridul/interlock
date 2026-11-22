/** Synthesised sound and haptic cues from docs/ui-v2/MOTION_GRAMMAR.md. Both are off until the user turns them on. */
export type CueName = "allowed" | "blocked" | "needs-human" | "approved" | "locked" | "error" | "executed";

type Tone = [freq: number, delay: number, len: number, type: OscillatorType];
export const TONES: Record<CueName, Tone[]> = {
  allowed: [[880, 0, 0.06, "sine"]],
  executed: [[880, 0, 0.06, "sine"], [1046, 0.08, 0.06, "sine"]],
  blocked: [[196, 0, 0.09, "square"], [196, 0.14, 0.09, "square"]],
  "needs-human": [[523, 0, 0.1, "sine"], [659, 0.12, 0.12, "sine"]],
  approved: [[523, 0, 0.1, "sine"], [659, 0.1, 0.1, "sine"], [784, 0.2, 0.22, "sine"]],
  locked: [[220, 0, 0.2, "triangle"], [165, 0.22, 0.32, "triangle"]],
  error: [[140, 0, 0.28, "sawtooth"]],
};

/** vibration patterns in ms (on, off, on, ...) */
export const PATTERNS: Record<CueName, number[]> = {
  allowed: [20],
  executed: [20, 40, 20],
  blocked: [30, 60, 30],
  "needs-human": [40, 50, 40],
  approved: [120],
  locked: [60, 40, 60, 40, 200],
  error: [200],
};

export const prefersReducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Sound {
  on = false;
  private ctx: AudioContext | null = null;
  static supported = () => typeof window !== "undefined" && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);

  /** Call from a click handler only: the AudioContext is created after a user gesture. */
  enable(v: boolean) {
    this.on = v && Sound.supported();
    if (this.on && !this.ctx) {
      try {
        const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new C();
      } catch {
        this.on = false;
      }
    }
    if (this.on) void this.ctx?.resume();
    return this.on;
  }

  play(name: CueName) {
    if (!this.on || !this.ctx) return;
    let spec = TONES[name];
    if (prefersReducedMotion()) spec = [spec[0]]; // reduced motion: one short tone
    const now = this.ctx.currentTime;
    for (const [f, d, len, type] of spec) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + d);
      g.gain.exponentialRampToValueAtTime(0.05, now + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + len);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(now + d);
      o.stop(now + d + len + 0.02);
    }
  }
}

export class Haptics {
  on = false;
  static supported = () => typeof navigator !== "undefined" && "vibrate" in navigator;
  play(name: CueName) {
    if (!this.on || !Haptics.supported()) return;
    const p = PATTERNS[name];
    navigator.vibrate(prefersReducedMotion() ? [p[0]] : p);
  }
}
