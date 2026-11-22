// Race view screenshots: headless Chrome over the DevTools protocol (Node 22+). One process at a time.
// usage: node shoot-race.mjs <outDir>
// The server must already run on 127.0.0.1:$PORT (default 8012), started with INTERLOCK_MODEL=off:
// the race view is shown in REPLAY mode (recorded run), so no model call is made.
// prefers-reduced-motion is forced to no-preference (headless Chrome reports 'reduce' by default).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , outDir] = process.argv;
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9336, URL = `http://127.0.0.1:${process.env.PORT || 8012}/`;
mkdirSync(outDir, { recursive: true });
const profile = path.join(process.env.KIROCREW_SCRATCH || process.env.TEMP, "chrome-race");
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" }); return (await r.json()).webSocketDebuggerUrl; } catch { await sleep(200); } }
  throw new Error("chrome did not start");
}
const sock = new WebSocket(await wsUrl()); await new Promise((r) => (sock.onopen = r));
let id = 0; const pend = new Map(); const report = { errors: [], shots: [], strips: {}, checks: [] };
sock.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") report.errors.push(d.params.exceptionDetails.text + " " + (d.params.exceptionDetails.exception?.description || ""));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") report.errors.push("console.error " + JSON.stringify(d.params.args.map((a) => a.value)));
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result))); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const hashes = {};
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const buf = Buffer.from(r.data, "base64");
  writeFileSync(path.join(outDir, name), buf);
  hashes[name] = createHash("sha1").update(buf).digest("hex").slice(0, 12);
  report.shots.push(name);
};
const btn = (t) => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(t)}))`;
const click = (t) => ev(`(()=>{const b=${btn(t)};if(!b||b.disabled)return false;b.click();return true})()`);
const counts = () => ev(`(()=>{const g=(i)=>document.querySelector('[data-testid='+i+']')?.textContent;return {triedA:g('tried-prompt-only'),forbA:g('forbidden-prompt-only'),triedB:g('tried-interlock'),forbB:g('forbidden-interlock')}})()`);
const check = async (label) => {
  const r = await ev(`(()=>{const r=document.querySelector('[data-testid=race-view]');const l=[...document.querySelectorAll('.rlane')].map(x=>x.getBoundingClientRect());
    return {scrollH:r.scrollHeight,clientH:r.clientHeight,scrollW:r.scrollWidth,clientW:r.clientWidth,lanes:l.map(b=>[Math.round(b.width),Math.round(b.height)])}})()`);
  report.checks.push({ at: label, ...r, counts: await counts() });
};
async function load(w, h) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const init = `try{sessionStorage.setItem('interlock.coldopen','1');localStorage.setItem('interlock.tour.v1','seen');}catch(e){}`;
  if (load.script) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: load.script });
  load.script = (await send("Page.addScriptToEvaluateOnNewDocument", { source: init })).identifier;
  await send("Page.navigate", { url: URL }); await sleep(1500);
  await ev("document.fonts.ready.then(()=>true)"); await sleep(400);
  await click("Race"); await sleep(900);
}
const pick = (v) => ev(`(()=>{const s=document.querySelector('.race-ctl select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(v)});s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
const waitDone = async (re, max = 150000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { const c = await counts(); if (re.test(c.triedB || "")) return true; await sleep(500); } return false; };

try {
  await send("Page.enable"); await send("Runtime.enable");
  for (const [w, h] of [[1440, 900], [1920, 1080]]) {
    await load(w, h);
    await shot(`${w}-race-before.png`); await check(`${w} before`);
    await click("Replay all");
    // mid: wait until about 8 attacks have been tried, then shoot while one is running
    for (let i = 0; i < 400; i++) { const c = await counts(); if (/^8 /.test(c.triedB || "")) break; await sleep(250); }
    await sleep(1300);
    await shot(`${w}-race-mid.png`); await check(`${w} mid`);
    const ok = await waitDone(/^20 of 20/);
    await sleep(600);
    await shot(`${w}-race-after.png`); await check(`${w} after (finished=${ok})`);
  }
  // 8-frame strip of one attack (edit-01: setup, human approval, model edit, transfer) at 1440x900
  await load(1440, 900); await pick("edit-01"); await sleep(300);
  const t0 = Date.now(); await click("Replay this attack");
  const names = [];
  for (const t of [150, 650, 1150, 1650, 2150, 2650, 3150, 3900]) {
    const w = t - (Date.now() - t0); if (w > 0) await sleep(w);
    const n = `strip-edit-01-${names.length}.png`; await shot(n); names.push(n);
  }
  report.strips.edit01 = { frames: names.length, distinct: new Set(names.map((n) => hashes[n])).size };
} finally {
  report.hashes = hashes;
  writeFileSync(path.join(outDir, "shoot-report.json"), JSON.stringify(report, null, 1));
  try { await send("Browser.close"); } catch {}
  sock.close(); setTimeout(() => { chrome.kill(); process.exit(0); }, 800);
}
console.log(JSON.stringify({ errors: report.errors, strips: report.strips, checks: report.checks }, null, 1));
