import { describe, expect, it } from "vitest";
import { FORMULA_BOTTOM, stageDetail, textK } from "../lib/geometry";

describe("stageDetail", () => {
  it("keeps the full formula block on a roomy stage", () => {
    const d = stageDetail(1, 5, false, false);
    expect(d.ledger && d.extras).toBe(true);
    expect(d.k).toBe(1);
  });
  it("drops the delta rows once they would reach the drawing", () => {
    expect(stageDetail(0.36, 5, false, false).ledger).toBe(false);
    expect(stageDetail(0.36, 5, false, false).extras).toBe(false);
  });
  it("a shown ledger always ends above the limit, at any scale", () => {
    for (let s = 0.2; s <= 1.5; s += 0.01) {
      for (const rows of [5, 11]) {
        const d = stageDetail(s, rows, true, true);
        if (d.ledger) expect(d.ledgerY + (rows - 1) * d.pitch + 6 + d.pitch).toBeLessThanOrEqual(FORMULA_BOTTOM + d.pitch);
      }
    }
  });
  it("text factor only grows when the drawing shrinks", () => {
    expect(textK(2)).toBe(1);
    expect(textK(0.3)).toBeGreaterThan(textK(0.6));
  });
});
