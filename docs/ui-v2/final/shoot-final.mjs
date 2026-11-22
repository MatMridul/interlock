// Final visual checks: headless Chrome over the DevTools protocol (Node 22+). One process at a time.
// usage: node shoot-final.mjs <outDir> <mfaCodeFile> [scenes]   scenes: comma list of desktop,mobile,arch (default all)
// The server must run on 127.0.0.1:$PORT (default 8012) with INTERLOCK_MODEL=off and DEMO_MFA_CODE set from the file.
// The code is read from a file outside the repo, typed into the autoplay prompt, and never printed or stored.
// prefers-reduced-motion is forced to no-preference (headless Chrome reports 'reduce' by default).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [, , outDir, codeFile, only] = process.argv;
const code = readFileSync(codeFile, "utf8").trim();
const scenes = (only || "desktop,mobile,arch").split(",");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9337, URL = `http://127.0.0.1:${process.env.PORT || 8012}/`;
mkdirSync(outDir, { recursive: true });
const profile = path.join(process.env.KIROCREW_SCRATCH || process.env.TEMP, "chrome-final");
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" }); return (await r.json()).webSocketDebuggerUrl; } catch { await sleep(200); } }
  throw new Error("chrome did not start");
}
const sock = new WebSocket(await wsUrl()); await new Promise((r) => (sock.onopen = r));
let id = 0; const pend = new Map(); const report = { errors: [], shots: [], timings: {}, checks: [] };
sock.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") report.errors.push(d.params.exceptionDetails.text + " " + (d.params.exceptionDetails.exception?.description || ""));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") report.errors.push("console.error " + JSON.stringify(d.params.args.map((a) => a.value)));
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result))); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const shot = async (name, full) => {
  const p = { format: "png" };
  if (full) { const m = await send("Page.getLayoutMetrics"); p.captureBeyondViewport = true; p.clip = { x: 0, y: 0, width: m.cssContentSize.width, height: m.cssContentSize.height, scale: 1 }; }
  const r = await send("Page.captureScreenshot", p);
  writeFileSync(path.join(outDir, name), Buffer.from(r.data, "base64"));
  report.shots.push(name);
};
const btn = (t) => `[...document.querySelectorAll('button')].find(b=>b.textContent.replace(/^[^A-Za-z]+/,"").trim().startsWith(${JSON.stringify(t)}))`;
const click = (t) => ev(`(()=>{const b=${btn(t)};if(!b||b.disabled)return false;b.click();return true})()`);
const caption = () => ev(`document.querySelector('.autocap')?.textContent||''`);
const overflow = (label) => ev(`(()=>{const out=[];const W=innerWidth;for(const e of document.querySelectorAll('button,h1,h2,h3,p,dt,dd,.chip,.autocap,.toast')){const r=e.getBoundingClientRect();if(r.width&&(r.right>W+1||r.left<-1))out.push((e.className||e.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right)+' '+(e.textContent||'').slice(0,30))}return {docW:document.documentElement.scrollWidth,W,out:out.slice(0,8)}})()`).then((r) => report.checks.push({ at: label, ...r }));
async function load(w, h, mobile = false) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  const init = `try{sessionStorage.setItem('interlock.coldopen','1');localStorage.setItem('interlock.tour.v1','seen');}catch(e){}`;
  if (load.script) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: load.script });
  load.script = (await send("Page.addScriptToEvaluateOnNewDocument", { source: init })).identifier;
  await send("Page.navigate", { url: URL }); await sleep(1800);
  await ev("document.fonts.ready.then(()=>true)"); await sleep(500);
}
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
async function waitCap(re, max = 60000) { const t0 = Date.now(); while (Date.now() - t0 < max) { if (re.test(await caption())) return true; await sleep(120); } return false; }

async function autoplay(w, h) {
  await load(w, h);
  await shot(`${w}-finance-idle.png`); await overflow(`${w} idle`);
  await click("Autoplay"); await sleep(500);
  await shot(`${w}-autoplay-prompt.png`);
  await setVal("#as-code", code); await sleep(100);
  await click("Start with the human key");
  const t0 = Date.now(); const seen = {}; let last = "";
  const tick = async () => { const c = await caption(); const m = /^(\d+) of (\d+)/.exec(c); if (m && c !== last) { last = c; seen[m[1]] = Math.round((Date.now() - t0) / 100) / 10; } };
  // frame at the human key step: the caption is up for 1.8 s before the key turns, then the key turns
  const t = Date.now(); let got = false;
  while (Date.now() - t < 60000) { await tick(); if (/the human turns the key/.test(last)) { got = true; break; } await sleep(100); }
  if (got) { await sleep(300); await shot(`${w}-autoplay-human-key.png`); await overflow(`${w} human key`); await sleep(1900); await shot(`${w}-autoplay-key-turned.png`); }
  // frame at a blocked attack: wait for the skip-MFA caption, then for the BLOCKED chip of that step
  while (Date.now() - t0 < 120000) { await tick(); if (/skip the MFA/.test(last)) break; await sleep(100); }
  for (let i = 0; i < 60; i++) { await tick(); const n = await ev(`document.querySelectorAll('.rcpt-btn.no').length`); if (n >= 3) break; await sleep(200); }
  await sleep(1200); await shot(`${w}-autoplay-blocked-attack.png`); await overflow(`${w} blocked attack`);
  // run to the end, recording step timings
  while (Date.now() - t0 < 150000) { await tick(); const on = await ev(`!!document.querySelector('.btn-play.stop')`); if (!on) break; if (/final state/.test(last) && !seen.shotFinal) { seen.shotFinal = 1; await sleep(2500); await shot(`${w}-autoplay-final.png`); } await sleep(150); }
  report.timings[w] = { stepStartsSeconds: seen, totalSeconds: Math.round((Date.now() - t0) / 100) / 10 };
  report.timings[w].transcript = await ev(`[...document.querySelectorAll('.tr .ln .chip')].map(c=>c.textContent.trim().slice(0,60))`);
}
async function safeShip(w, h, mobile = false) {
  await load(w, h, mobile);
  if (!mobile) { /* idle already shot in autoplay() for desktop */ } else { await shot(`${w}-finance-idle.png`); await overflow(`${w} idle`); }
  await click("safe-ship"); await sleep(1200);
  await click("Replay the recorded run");
  if (mobile) { await sleep(2500); } else {
    for (let i = 0; i < 80; i++) { if (await ev(`!!document.querySelector('[data-refused]')`)) break; await sleep(150); }
    await sleep(500);
  }
  await shot(`${w}-safe-ship.png`, mobile); await overflow(`${w} safe-ship`);
  if (!mobile) { for (let i = 0; i < 80; i++) { const d = await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Replay the recorded run'))?.disabled`); if (!d) break; await sleep(200); } await shot(`${w}-safe-ship-end.png`); }
}
async function race(w, h) {
  await load(w, h); await click("Race"); await sleep(900);
  await click("Replay all");
  const sel = []; 
  for (let i = 0; i < 600; i++) { sel.push(await ev(`document.querySelector('.race-ctl select')?.value`)); const t = await ev(`document.querySelector('[data-testid=tried-interlock]')?.textContent||''`); if (/^20 of 20/.test(t)) break; if (i === 120) await shot(`${w}-race-mid.png`); await sleep(250); }
  report.timings[`race-${w}`] = { selectorValuesSeen: [...new Set(sel)].length, first: sel[0], last: sel[sel.length - 1] };
  await sleep(800); await shot(`${w}-race-after.png`); await overflow(`${w} race`);
}
try {
  await send("Page.enable"); await send("Runtime.enable");
  if (scenes.includes("desktop")) for (const [w, h] of [[1440, 900], [1920, 1080]]) { await autoplay(w, h); await safeShip(w, h); await race(w, h); }
  if (scenes.includes("mobile")) await safeShip(390, 844, true);
  if (scenes.includes("arch")) {
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pathToFileURL(path.resolve("../../architecture/architecture.html")).href }); await sleep(2500);
    await shot("architecture.png", true);
  }
} finally {
  writeFileSync(path.join(outDir, "shoot-report.json"), JSON.stringify(report, null, 1));
  try { await send("Browser.close"); } catch {}
  sock.close(); setTimeout(() => { chrome.kill(); process.exit(0); }, 800);
}
console.log(JSON.stringify({ errors: report.errors, timings: report.timings, checks: report.checks }, null, 1));