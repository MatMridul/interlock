// Headless Chrome over the DevTools protocol (Node 22+ built-in WebSocket). One process at a time.
// usage: node shoot-ui.mjs <outDir> <mfaCodeFile>   (server must already run on 127.0.0.1:8000 with STUB=1)
// The MFA code is read from a file outside the repo and typed on the on-screen keypad; it is never printed or stored.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const [, , outDir, codeFile] = process.argv;
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333, URL = "http://127.0.0.1:8000/";
const code = readFileSync(codeFile, "utf8").trim();
mkdirSync(outDir, { recursive: true });
const profile = path.join(process.env.KIROCREW_SCRATCH || process.env.TEMP, "chrome-ui");
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" }); return (await r.json()).webSocketDebuggerUrl; } catch { await sleep(200); } }
  throw new Error("chrome did not start");
}
const sock = new WebSocket(await wsUrl()); await new Promise((r) => (sock.onopen = r));
let id = 0; const pend = new Map(); const report = { errors: [], frames: null, shots: [], strips: {} };
sock.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") report.errors.push(d.params.exceptionDetails.text + " " + (d.params.exceptionDetails.exception?.description || ""));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") report.errors.push("console.error " + JSON.stringify(d.params.args.map((a) => a.value)));
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result))); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const shot = async (name, clip) => { const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); writeFileSync(path.join(outDir, name), Buffer.from(r.data, "base64")); if (!clip) report.shots.push(name); };
const btn = (t) => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(t)}))`;
const click = (t) => ev(`(()=>{const b=${btn(t)};if(!b||b.disabled)return false;b.click();return true})()`);
const idle = async (max = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { await sleep(300); const busy = await ev(`(()=>{const b=document.querySelector('.btn-send');return b?b.textContent.includes('Running'):false})()`); if (!busy) { await sleep(600); const again = await ev(`(()=>{const b=document.querySelector('.btn-send');return b?b.textContent.includes('Running'):false})()`); if (!again) return; } } };
// wait until the animation queue is drained: the stage has no token in flight (approximation: fixed settle time)
const settle = async (ms = 3200) => { await idle(); await sleep(ms); };
async function load(w, h, mobile = false, keepCold = false) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Page.navigate", { url: URL }); await sleep(1200);
  if (!keepCold) { await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));window.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));document.querySelector('[data-testid=cold-open]')?.click();true"); await sleep(700); }
  await ev("document.fonts.ready.then(()=>true)"); await sleep(400);
}
async function resetSession() { await click("Reset session"); await sleep(900); }
async function enterCode() {
  await click("Lift cover"); await sleep(300); await click("Enter code");
  await sleep(500);
  for (const d of code) await ev(`(()=>{const g=document.querySelector('[aria-label=Keypad]');const b=[...g.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(d)});b&&b.click();return true})()`);
  await sleep(200);
}
const rectOf = (sel) => ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
// shoot a series at target times (ms after the click that starts the animation)
async function series(t0, times, prefix, clip) {
  const real = [];
  for (let i = 0; i < times.length; i++) { const wait = times[i] - (Date.now() - t0); if (wait > 0) await sleep(wait); const at = Date.now() - t0; real.push(at); await shot(`${prefix}-${i}.png`, clip); }
  return real;
}

try {
  await send("Page.enable"); await send("Runtime.enable");
  for (const [w, h] of [[1440, 900], [1920, 1080]]) {
    const T = `${w}`;
    await load(w, h, false, true); await sleep(900); await shot(`${T}-cold-open.png`);
    await load(w, h); await shot(`${T}-idle.png`);
    // allowed (and frame-time sample at 1440)
    if (w === 1440) await ev("window.__dt=[];(function f(t){if(window.__last)window.__dt.push(t-window.__last);window.__last=t;if(!window.__stop)requestAnimationFrame(f)})(0);true");
    let t0 = Date.now(); await click("Log in");
    const a = await series(t0, [550, 1550], `${T}-tmp-a`);
    await rename(`${T}-tmp-a-0.png`, `${T}-token-in-flight.png`); await rename(`${T}-tmp-a-1.png`, `${T}-allowed-mid.png`);
    await settle();
    if (w === 1440) { report.frames = await ev("window.__stop=true;(()=>{const d=window.__dt.filter(x=>x<1000);d.sort((a,b)=>a-b);const n=d.length;return {n,median:d[Math.floor(n/2)],p95:d[Math.floor(n*.95)],max:d[n-1],over33:d.filter(x=>x>33.4).length}})()"); report.frames.note = "headless Chrome, whole-page rAF deltas from page load through one allowed animation, software rendering"; }
    // rejected
    await resetSession();
    t0 = Date.now(); await click("Execute transfer");
    await series(t0, [1350, 1850], `${T}-tmp-r`);
    await rename(`${T}-tmp-r-0.png`, `${T}-rejected-barrier.png`); await rename(`${T}-tmp-r-1.png`, `${T}-rejected-shatter.png`);
    await settle(); await shot(`${T}-after-reject-scoreboard.png`);
    // strips at 1440
    if (w === 1440) {
      const clip = await rectOf(".stage");
      await resetSession(); t0 = Date.now(); await click("Log in");
      report.strips.allowed = await series(t0, [250, 600, 950, 1300, 1650, 2000, 2400, 3000], "strip-allowed", clip);
      await settle(); await resetSession(); t0 = Date.now(); await click("Execute transfer");
      report.strips.rejected = await series(t0, [250, 650, 1050, 1400, 1700, 2000, 2400, 3000], "strip-rejected", clip);
      await settle();
    }
    // key flow
    await resetSession();
    await click("Log in"); await settle(2500); await click("Draft 250"); await settle(2500);
    await click("Lift cover"); await sleep(500); await shot(`${T}-key-cover-lifted.png`);
    await click("Enter code"); await sleep(500); for (const d of code.slice(0, 2)) await ev(`(()=>{const g=document.querySelector('[aria-label=Keypad]');[...g.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(d)})?.click();return true})()`);
    await shot(`${T}-key-keypad.png`);
    await ev("document.querySelector('dialog')?.close();true"); await sleep(300);
    await enterCode(); await click("Turn key"); await sleep(1800); await shot(`${T}-key-approved.png`); await sleep(2500);
    await click("Execute transfer"); await settle(3000); await shot(`${T}-transfer-success.png`);
    await click("Proof"); await sleep(700); await shot(`${T}-proof-drawer.png`);
    await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));true"); await sleep(500);
    // locked
    await resetSession();
    for (let i = 0; i < 5; i++) { await click("Execute transfer"); await settle(900); }
    await settle(2500); await shot(`${T}-locked.png`);
    // autoplay
    await resetSession(); await click("Autoplay"); await sleep(9000); await shot(`${T}-autoplay-running.png`);
    // answer the human step when asked, then finish
    for (let i = 0; i < 40; i++) { const open = await ev("!!document.querySelector('dialog[open]')"); if (open) { for (const d of code) await ev(`(()=>{const g=document.querySelector('[aria-label=Keypad]');[...g.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(d)})?.click();return true})()`); await sleep(200); await click("Turn key"); break; } await sleep(1500); }
    await sleep(3000); await shot(`${T}-autoplay-after-key.png`);
    await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));true"); await sleep(800);
    if (w === 1440) {
      // 1280x720 idle
    }
  }
  await load(1280, 720); await resetSession(); await shot("1280-idle.png");
  await load(390, 844, true); await resetSession(); await shot("390-idle.png");
  const t0 = Date.now(); await click("Execute transfer"); await series(t0, [1500], "390-tmp"); await rename("390-tmp-0.png", "390-rejected.png");
  await settle(); await shot("390-after-reject.png");
} finally {
  writeFileSync(path.join(outDir, "shoot-report.json"), JSON.stringify(report, null, 1));
  try { await send("Browser.close"); } catch {}
  sock.close(); setTimeout(() => { chrome.kill(); process.exit(0); }, 800);
}
console.log(JSON.stringify(report));

async function rename(a, b) { const fs = await import("node:fs"); fs.renameSync(path.join(outDir, a), path.join(outDir, b)); const i = report.shots.indexOf(a); if (i >= 0) report.shots[i] = b; }
