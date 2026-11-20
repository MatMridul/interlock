import type { Beat, PlayOpts, Player } from "./director";
import { AGENT_PORT, AIRLOCK, ORB_R, SINK, VIEW, cubicAt, findEdge, flightCurve, gatePoint, suckCurve, type Curve, type Edge, type Pt } from "./geometry";
import { Timeline, buildPhases, type Hook } from "./timeline";

export const COLOR = { green: "#7dffb2", ink: "#d9e8de", amber: "#ffb347", red: "#ff6b5e", white: "#f2fff8" };

export interface Geom {
  orbs: Record<string, Pt>;
  edges: Edge[];
}

/** Callbacks into the SVG layer (afterglow, shake, reduced-motion flash). */
export interface FxHooks {
  glow(edgeId: string): void;
  shake(state: string): void;
  flash(state: string, kind: "ok" | "bad"): void;
}

declare global {
  interface Window {
    __chimeric?: { phase: string; progress: number; busy: boolean; setTimeScale(n: number): void; frames: number[] };
  }
}

const ease = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inout: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Canvas layer for everything that travels: tokens, bolts, shards. It draws only while a beat plays. */
export class Fx implements Player {
  private ctx: CanvasRenderingContext2D | null;
  private s = 1; private ox = 0; private oy = 0; private dpr = 1;
  geom: Geom = { orbs: {}, edges: [] };
  timeScale = 1;
  private frameTimes: number[] = [];

  constructor(private canvas: HTMLCanvasElement, private hooks: FxHooks) {
    this.ctx = canvas.getContext("2d");
    if (typeof window !== "undefined") {
      window.__chimeric = { phase: "idle", progress: 0, busy: false, frames: this.frameTimes, setTimeScale: (n) => { this.timeScale = Math.max(0.05, n); } };
    }
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.s = Math.min(r.width / VIEW.w, r.height / VIEW.h) || 1;
    this.ox = (r.width - VIEW.w * this.s) / 2;
    this.oy = (r.height - VIEW.h * this.s) / 2;
  }

  /** Mapping from stage units to CSS pixels, so HTML overlays (the airlock) line up with the canvas. */
  get mapping() {
    return { s: this.s, ox: this.ox, oy: this.oy };
  }

  private clear() {
    const c = this.ctx;
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private begin() {
    const c = this.ctx!;
    c.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, this.dpr * this.ox, this.dpr * this.oy);
    c.clearRect(-this.ox / this.s, -this.oy / this.s, this.canvas.width / (this.dpr * this.s), this.canvas.height / (this.dpr * this.s));
    c.lineCap = "round";
    c.lineJoin = "round";
  }

  play(beat: Beat, opts: PlayOpts): Promise<void> {
    const fire = (h: Hook) => (h === "spawn" ? beat.onSpawn() : h === "impact" ? beat.onImpact() : beat.onSettle());
    const phases = buildPhases(beat.kind, beat.verdict, opts.reduced);
    const tl = new Timeline(phases, Math.max(0.05, opts.scale * this.timeScale));
    const dbg = typeof window !== "undefined" ? window.__chimeric : undefined;
    const geom = this.geom;
    const orb = geom.orbs[beat.from];
    const target = geom.orbs[beat.to] ?? orb;
    const reducedBadge = beat.verdict === "ACCEPT" ? "ok" : "bad";
    if (dbg) dbg.busy = true;

    return new Promise<void>((resolve) => {
      let t0 = -1, raf = 0, finished = false, last = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(raf);
        clearTimeout(guard);
        // make sure every hook has fired, in order, even if frames were skipped (hidden tab)
        const s = tl.step(Infinity);
        for (const ph of s.entered) ph.hooks?.forEach(fire);
        this.clear();
        if (dbg) { dbg.busy = false; dbg.phase = "idle"; dbg.progress = 0; }
        resolve();
      };
      const guard = setTimeout(finish, tl.total + 400);

      const frame = (now: number) => {
        if (finished) return;
        if (t0 < 0) t0 = now;
        if (last) { this.frameTimes.push(now - last); if (this.frameTimes.length > 600) this.frameTimes.shift(); }
        last = now;
        const st = tl.step(now - t0);
        for (const ph of st.entered) {
          ph.hooks?.forEach(fire);
          if (opts.reduced && ph.name === "highlight") this.hooks.flash(beat.verdict === "ACCEPT" ? beat.to : beat.from, reducedBadge);
          if (!opts.reduced && ph.name === "ignite" && beat.verdict === "ACCEPT") {
            const e = findEdge(geom.edges, beat.from, beat.to);
            if (e) this.hooks.glow(e.id);
          }
          if (!opts.reduced && ph.name === "impact") this.hooks.shake(beat.from);
        }
        if (dbg) { dbg.phase = st.phase.name; dbg.progress = st.p; }
        if (st.done) return finish();
        if (!opts.reduced && this.ctx && orb) this.draw(beat, st.phase.name, st.p, now - t0, geom, orb, target);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }

  // ---- drawing -------------------------------------------------------------------------------

  private draw(beat: Beat, phase: string, p: number, elapsed: number, geom: Geom, orb: Pt, target: Pt) {
    const c = this.ctx!;
    this.begin();
    const human = beat.kind === "human";
    const origin = human ? AIRLOCK : AGENT_PORT;
    const gate = gatePoint(orb);
    const fc = flightCurve(origin, gate);
    const accepted = beat.verdict === "ACCEPT";
    const edge = accepted ? findEdge(geom.edges, beat.from, beat.to) : undefined;
    const baseColor = human ? COLOR.amber : COLOR.ink;
    const seed = beat.id * 7919;
    const jitterTick = Math.floor(elapsed / 83); // arcs re-roll at about 12 Hz: a line redraw, not a flash

    switch (phase) {
      case "spawn": {
        const e = ease.out(p);
        this.materialise(c, origin, beat.symbol, baseColor, e, seed);
        break;
      }
      case "flight": {
        const t = ease.inout(p);
        const trail: Pt[] = [];
        for (let k = 10; k >= 0; k--) trail.push(cubicAt(fc, clamp01(t - k * 0.028)));
        this.bolt(c, trail, baseColor, 5, seed + jitterTick, 0.9);
        this.token(c, cubicAt(fc, t), beat.symbol, baseColor, 1, 1);
        break;
      }
      case "verdict": {
        this.gateRing(c, orb, baseColor, 0.5 + 0.5 * Math.sin(p * Math.PI), accepted ? COLOR.green : baseColor);
        this.token(c, gate, beat.symbol, baseColor, 1, 1 + 0.06 * Math.sin(p * Math.PI));
        break;
      }
      case "conduit": {
        this.gateRing(c, orb, COLOR.green, 0.7 * (1 - p), COLOR.green);
        const fp = ease.inout(p);
        const pre = clamp01(p / 0.14);
        const start = edge ? edge.curve.p0 : orb;
        if (edge) {
          const pts: Pt[] = [];
          const n = 26;
          for (let k = 0; k <= n; k++) pts.push(cubicAt(edge.curve, (k / n) * fp));
          this.bolt(c, pts, COLOR.green, 9, seed + jitterTick, 1);
        }
        const pos = pre < 1 ? lerpPt(gate, start, ease.out(pre)) : edge ? cubicAt(edge.curve, fp) : lerpPt(orb, target, fp);
        this.token(c, pos, beat.symbol, COLOR.green, 1, 1);
        break;
      }
      case "ignite": {
        this.ignite(c, target, p, seed);
        if (edge) {
          const pts: Pt[] = [];
          for (let k = 0; k <= 24; k++) pts.push(cubicAt(edge.curve, k / 24));
          c.globalAlpha = 1 - p;
          this.bolt(c, pts, COLOR.green, 5, seed, 1 - p);
          c.globalAlpha = 1;
        }
        break;
      }
      case "impact": {
        this.barrier(c, orb, 0, 1, COLOR.red, 1);
        this.starburst(c, gate, p, COLOR.red);
        this.token(c, gate, beat.symbol, COLOR.red, 1, 1 - 0.15 * p);
        break;
      }
      case "shudder": {
        const amp = 6 * (1 - p);
        const dx = Math.sin(p * 38) * amp;
        this.barrier(c, orb, dx, 1 - 0.3 * p, COLOR.red, 1);
        this.token(c, { x: gate.x + dx * 0.8, y: gate.y }, beat.symbol, COLOR.red, 1, 0.9 + Math.sin(p * 30) * 0.03);
        break;
      }
      case "shatter": {
        this.barrier(c, orb, 0, 0.7 * (1 - p), COLOR.red, 1);
        this.shards(c, gate, orb, p, 0, seed);
        break;
      }
      case "suck": {
        this.shards(c, gate, orb, 1, p, seed);
        this.sinkPulse(c, p);
        break;
      }
    }
    c.globalAlpha = 1;
  }

  private token(c: CanvasRenderingContext2D, at: Pt, label: string, color: string, alpha: number, k: number) {
    c.save();
    c.globalAlpha = alpha;
    c.font = '600 15px "IBM Plex Mono", Consolas, monospace';
    const w = c.measureText(label).width + 26, h = 28;
    c.translate(at.x, at.y);
    c.scale(k, k);
    c.shadowColor = color;
    c.shadowBlur = 22;
    c.fillStyle = "rgba(5,7,10,0.92)";
    c.strokeStyle = color;
    c.lineWidth = 1.6;
    c.beginPath();
    c.rect(-w / 2, -h / 2, w, h);
    c.fill();
    c.stroke();
    c.shadowBlur = 0;
    c.beginPath();
    for (const sx of [-1, 1]) {
      c.moveTo(sx * (w / 2 - 6), -h / 2 - 4); c.lineTo(sx * (w / 2 + 4), -h / 2 - 4);
      c.lineTo(sx * (w / 2 + 4), h / 2 + 4); c.lineTo(sx * (w / 2 - 6), h / 2 + 4);
    }
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = COLOR.white;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(label, 0, 1);
    c.restore();
  }

  /** Token materialising out of converging sparks. */
  private materialise(c: CanvasRenderingContext2D, at: Pt, label: string, color: string, e: number, seed: number) {
    const r = rng(seed);
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = (30 + r() * 40) * (1 - e);
      c.fillStyle = color;
      c.globalAlpha = 0.9 * e;
      c.beginPath();
      c.arc(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d, 1.8, 0, 7);
      c.fill();
    }
    c.restore();
    c.strokeStyle = color;
    c.globalAlpha = 1 - e;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(at.x, at.y, 14 + 40 * e, 0, 7);
    c.stroke();
    this.token(c, at, label, color, e, 0.5 + 0.5 * e);
  }

  /** A jagged arc through `pts`. Three strokes: wide glow, coloured core, thin white centre. */
  private bolt(c: CanvasRenderingContext2D, pts: Pt[], color: string, amp: number, seed: number, alpha: number) {
    if (pts.length < 2) return;
    const r = rng(seed * 31 + 7);
    const j: Pt[] = pts.map((q, i) => {
      if (i === 0 || i === pts.length - 1) return q;
      const a = pts[i + 1], b = pts[i - 1];
      const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1;
      const taper = Math.sin((i / (pts.length - 1)) * Math.PI);
      const o = (r() - 0.5) * 2 * amp * taper;
      return { x: q.x - (dy / l) * o, y: q.y + (dx / l) * o };
    });
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = alpha;
    const stroke = (w: number, col: string, a: number, blur = 0) => {
      c.beginPath();
      c.moveTo(j[0].x, j[0].y);
      for (let i = 1; i < j.length; i++) c.lineTo(j[i].x, j[i].y);
      c.lineWidth = w;
      c.strokeStyle = col;
      c.globalAlpha = alpha * a;
      c.shadowColor = color;
      c.shadowBlur = blur;
      c.stroke();
    };
    stroke(9, color, 0.16, 16);
    stroke(3, color, 0.85, 8);
    stroke(1, COLOR.white, 0.9);
    c.restore();
  }

  private gateRing(c: CanvasRenderingContext2D, orb: Pt, color: string, a: number, _core: string) {
    c.save();
    c.strokeStyle = color;
    c.globalAlpha = 0.25 + 0.6 * a;
    c.lineWidth = 2;
    c.shadowColor = color;
    c.shadowBlur = 14;
    c.beginPath();
    c.arc(orb.x, orb.y, ORB_R + 14, 0, 7);
    c.stroke();
    c.restore();
  }

  private barrier(c: CanvasRenderingContext2D, orb: Pt, dx: number, a: number, color: string, _w: number) {
    c.save();
    c.translate(dx, 0);
    c.strokeStyle = color;
    c.shadowColor = color;
    c.shadowBlur = 18;
    c.globalAlpha = Math.max(0, a);
    c.lineWidth = 5;
    const face = Math.atan2(AGENT_PORT.y - orb.y, AGENT_PORT.x - orb.x); // the side the token hits
    for (let i = -1; i <= 1; i++) {
      const a0 = face + i * 0.62 - 0.24, a1 = face + i * 0.62 + 0.24;
      c.beginPath();
      c.arc(orb.x, orb.y, ORB_R + 22, a0, a1);
      c.stroke();
    }
    c.lineWidth = 1;
    c.beginPath();
    c.arc(orb.x, orb.y, ORB_R + 30, face - 1.1, face + 1.1);
    c.stroke();
    c.restore();
  }

  private starburst(c: CanvasRenderingContext2D, at: Pt, p: number, color: string) {
    c.save();
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.globalAlpha = 1 - p;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r0 = 8 + 6 * p, r1 = r0 + 22 * ease.out(p);
      c.beginPath();
      c.moveTo(at.x + Math.cos(a) * r0, at.y + Math.sin(a) * r0);
      c.lineTo(at.x + Math.cos(a) * r1, at.y + Math.sin(a) * r1);
      c.stroke();
    }
    c.restore();
  }

  /** Shards burst outward (burst p), then curve into the sink (suck p). Deterministic from the seed. */
  private shards(c: CanvasRenderingContext2D, gate: Pt, _orb: Pt, burst: number, suck: number, seed: number) {
    const r = rng(seed);
    const sc: Curve = suckCurve(gate);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.shadowColor = COLOR.red;
    c.shadowBlur = 8;
    for (let i = 0; i < 36; i++) {
      const a = r() * Math.PI * 2, sp = 24 + r() * 56, delay = r() * 0.45, size = 1.5 + r() * 2.6;
      const out = ease.out(burst);
      const burstPos = { x: gate.x + Math.cos(a) * sp * out, y: gate.y + Math.sin(a) * sp * out };
      let pos = burstPos, alpha = 1 - 0.25 * out;
      if (suck > 0) {
        const u = clamp01((suck - delay) / (1 - delay));
        const q = ease.inout(u);
        const along = cubicAt(sc, q);
        pos = { x: lerp(burstPos.x, along.x, q) + (1 - q) * 0, y: lerp(burstPos.y, along.y, q) };
        alpha = (1 - u) * 0.9 + 0.05;
      }
      c.globalAlpha = Math.max(0, alpha);
      c.fillStyle = i % 3 === 0 ? COLOR.white : COLOR.red;
      c.save();
      c.translate(pos.x, pos.y);
      c.rotate(a + suck * 6);
      c.fillRect(-size * 1.8, -size * 0.5, size * 3.6, size);
      c.restore();
    }
    c.restore();
  }

  private sinkPulse(c: CanvasRenderingContext2D, p: number) {
    const u = clamp01((p - 0.55) / 0.45);
    if (u <= 0) return;
    c.save();
    c.strokeStyle = COLOR.red;
    c.globalAlpha = 0.7 * (1 - u);
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(SINK.x, SINK.y, 18 + 42 * ease.out(u), 0, 7);
    c.stroke();
    c.restore();
  }

  private ignite(c: CanvasRenderingContext2D, at: Pt, p: number, seed: number) {
    const e = ease.out(p);
    c.save();
    c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(at.x, at.y, ORB_R * 0.2, at.x, at.y, ORB_R + 70 * e);
    g.addColorStop(0, `rgba(125,255,178,${0.5 * (1 - p)})`);
    g.addColorStop(1, "rgba(125,255,178,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(at.x, at.y, ORB_R + 70 * e, 0, 7);
    c.fill();
    c.strokeStyle = COLOR.green;
    c.lineWidth = 2;
    for (let k = 0; k < 2; k++) {
      const u = clamp01(p * 1.3 - k * 0.22);
      c.globalAlpha = (1 - u) * 0.85;
      c.beginPath();
      c.arc(at.x, at.y, ORB_R + 6 + 64 * ease.out(u), 0, 7);
      c.stroke();
    }
    const r = rng(seed + 3);
    c.fillStyle = COLOR.green;
    for (let i = 0; i < 20; i++) {
      const a = r() * Math.PI * 2, sp = 30 + r() * 70;
      c.globalAlpha = (1 - p) * 0.9;
      c.beginPath();
      c.arc(at.x + Math.cos(a) * (ORB_R + sp * e), at.y + Math.sin(a) * (ORB_R + sp * e), 1.7, 0, 7);
      c.fill();
    }
    c.restore();
  }
}
