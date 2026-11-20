/** Phase timing for one beat. Pure data and a stepper, so order and hook firing can be unit tested. */
export type Hook = "spawn" | "impact" | "settle";

export interface Phase {
  name: string;
  dur: number; // ms at time scale 1
  hooks?: Hook[]; // fired once, when the phase is entered
}

export const DUR = { spawn: 380, flight: 760, verdict: 140, conduit: 620, ignite: 520, impact: 120, shudder: 380, shatter: 300, suck: 760 };

export function buildPhases(kind: "agent" | "human", verdict: "ACCEPT" | "REJECT", reduced: boolean): Phase[] {
  if (reduced) {
    // no travelling token: an instant highlight and a short fade, all three hooks at once
    return [
      { name: "highlight", dur: 160, hooks: ["spawn", "impact", "settle"] },
      { name: "fade", dur: 240 },
    ];
  }
  const flight = kind === "human" ? DUR.flight * 0.8 : DUR.flight;
  const head: Phase[] = [
    { name: "spawn", dur: DUR.spawn, hooks: ["spawn"] },
    { name: "flight", dur: flight },
    { name: "verdict", dur: DUR.verdict },
  ];
  if (verdict === "ACCEPT") {
    return [...head, { name: "conduit", dur: DUR.conduit, hooks: ["impact"] }, { name: "ignite", dur: DUR.ignite, hooks: ["settle"] }];
  }
  return [
    ...head,
    { name: "impact", dur: DUR.impact, hooks: ["impact"] },
    { name: "shudder", dur: DUR.shudder },
    { name: "shatter", dur: DUR.shatter, hooks: ["settle"] },
    { name: "suck", dur: DUR.suck },
  ];
}

export interface Step {
  index: number; // current phase
  phase: Phase;
  p: number; // 0..1 progress inside the phase
  entered: Phase[]; // phases entered since the previous step (several when frames were skipped)
  done: boolean;
}

export class Timeline {
  readonly total: number;
  private starts: number[] = [];
  private entered = -1;
  constructor(readonly phases: Phase[], readonly scale = 1) {
    let t = 0;
    for (const ph of phases) {
      this.starts.push(t);
      t += ph.dur * scale;
    }
    this.total = t;
  }

  step(elapsed: number): Step {
    let i = this.phases.length - 1;
    for (let k = 0; k < this.phases.length; k++) {
      if (elapsed < this.starts[k] + this.phases[k].dur * this.scale) { i = k; break; }
    }
    const done = elapsed >= this.total;
    const entered = this.phases.slice(this.entered + 1, i + 1);
    this.entered = Math.max(this.entered, i);
    const ph = this.phases[i];
    const p = done ? 1 : Math.min(1, Math.max(0, (elapsed - this.starts[i]) / (ph.dur * this.scale)));
    return { index: i, phase: ph, p, entered, done };
  }
}
