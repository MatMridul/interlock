// WCAG 2.x contrast ratios over the design tokens. Run: node docs/ui-v2/contrast.mjs
const T = {
  void: "#05070a", panel: "#0a0f12", panel2: "#101719", ink: "#e8f1ec", muted: "#8fa89d", faint: "#6b8278",
  green: "#3dff9a", violet: "#a58bff", amber: "#ffb23d", red: "#ff5c75", line: "#2a3b36",
};
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [
  ["ink", "void", 4.5], ["ink", "panel", 4.5], ["muted", "void", 4.5], ["muted", "panel", 4.5], ["muted", "panel2", 4.5],
  ["faint", "void", 3], ["green", "void", 4.5], ["green", "panel", 4.5], ["violet", "void", 4.5], ["violet", "panel", 4.5],
  ["amber", "void", 4.5], ["amber", "panel", 4.5], ["red", "void", 4.5], ["red", "panel", 4.5], ["line", "void", 1.5],
  ["void", "green", 4.5], ["void", "amber", 4.5], ["void", "red", 4.5],
];
let bad = 0;
for (const [f, b, need] of pairs) {
  const r = cr(T[f], T[b]); const ok = r >= need; if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${f.padEnd(6)} ${T[f]} on ${b.padEnd(6)} ${T[b]}  ${r.toFixed(2)}:1  (need ${need})`);
}
console.log(bad ? `${bad} FAILING` : "all pairs pass");
process.exit(bad ? 1 : 0);
