// WCAG 2.x contrast over the real tokens in src/styles.css. Run: node scripts/contrast.mjs
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const T = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const cr = (a, b) => { const [x, y] = [lum(T[a]), lum(T[b])].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [];
for (const fg of ["ink", "muted", "faint", "ph", "red", "amber"]) for (const bg of ["void", "panel", "panel2"]) pairs.push([fg, bg, 4.5]);
pairs.push(["ph-dim", "void", 3], ["line2", "void", 1.5], ["void", "ph", 4.5], ["void", "amber", 4.5], ["void", "red", 4.5], ["amber-dim", "void", 3]);
let bad = 0;
for (const [f, b, min] of pairs) { const r = cr(f, b); const ok = r >= min; if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"} ${f} on ${b}: ${r.toFixed(2)} (min ${min})`); }
console.log(bad ? `${bad} failing` : "all pass");
process.exit(bad ? 1 : 0);
