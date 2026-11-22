// Headless Chrome over the DevTools protocol (Node 22+ built-in WebSocket). One process at a time.
// usage: node shoot-depth.mjs <outDir> <mfaCodeFile> [scene,scene,...]
// The server must already run on 127.0.0.1:$PORT (default 8011) with STUB=1 and STUB_DELAY_MS set (for example 600),
// otherwise the stub answers instantly and the animation frames are not real mid-animation frames.
// The MFA code is read from a file outside the repo and is never printed or stored.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const [, , outDir, codeFile, only] = process.argv;
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9335, URL = `http://127.0.0.1:${process.env.PORT || 8011}/`;
const code = readFileSync(codeFile, "utf8").trim();
mkdirSync(outDir, { recursive: true });
const scenes = only ? only.split(",") : null;
const want = (n) => !scenes || scenes.includes(n);
const profile = path.join(process.env.KIROCREW_SCRATCH || process.env.TEMP, "chrome-depth");
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" }); return (await r.json()).webSocketDebuggerUrl; } catch { await sleep(200); } }
  throw new Error("chrome did not start");
}
const sock = new WebSocket(await wsUrl()); await new Promise((r) => (sock.onopen = r));
let id = 0; const pend = new Map(); const report = { errors: [], shots: [], strips: {}, overlaps: [] };
sock.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") report.errors.push(d.params.exceptionDetails.text + " " + (d.params.exceptionDetails.exception?.description || ""));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") report.errors.push("console.error " + JSON.stringify(d.params.args.map((a) => a.value)));
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result))); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const hashes = {};
const shot = async (name, clip) => {
  const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  const buf = Buffer.from(r.data, "base64");
  writeFileSync(path.join(outDir, name), buf);
  hashes[name] = createHash("sha1").update(buf).digest("hex").slice(0, 12);
  if (!clip) report.shots.push(name);
  return hashes[name];
};
const btn = (t) => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(t)}))`;
const click = (t) => ev(`(()=>{const b=${btn(t)};if(!b||b.disabled)return false;b.click();return true})()`);
const key = (k, extra = {}) => ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)},bubbles:true,...${JSON.stringify(extra)}}));true`);
const running = () => ev(`(()=>{const b=document.querySelector('.btn-send');return b?b.textContent.includes('Running'):false})()`);
const idle = async (max = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { await sleep(300); if (!(await running())) { await sleep(700); if (!(await running())) return; } } };
const settle = async (ms = 3000) => { await idle(); await sleep(ms); };
const rectOf = (sel) => ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);

/** seen=true: cold open and tour are already done (the normal state of a returning visitor). */
// Headless Chrome reports prefers-reduced-motion: reduce by default, which silently turned every earlier capture into the reduced-motion path. Force it explicitly.
async function load(w, h, { mobile = false, seen = true, layout = null, reduced = false } = {}) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await ev("true");
  const init = `try{sessionStorage.setItem('interlock.coldopen','1');${seen ? "localStorage.setItem('interlock.tour.v1','seen');" : "localStorage.removeItem('interlock.tour.v1');"}${layout ? `localStorage.setItem('interlock.layout.v1',${JSON.stringify(JSON.stringify(layout))});` : "localStorage.removeItem('interlock.layout.v1');"}}catch(e){}`;
  if (load.script) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: load.script });
  load.script = (await send("Page.addScriptToEvaluateOnNewDocument", { source: init })).identifier;
  await send("Page.navigate", { url: URL }); await sleep(1500);
  await ev("document.fonts.ready.then(()=>true)"); await sleep(500);
}
async function enterCode() {
  await click("Lift cover"); await sleep(300); await click("Enter code"); await sleep(500);
  for (const d of code) await ev(`(()=>{const g=document.querySelector('[aria-label=Keypad]');const b=[...g.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(d)});b&&b.click();return true})()`);
  await sleep(200);
}
/** Frames at fixed offsets from t0; returns the distinct-hash count so a strip of identical frames is caught. */
async function strip(t0, times, prefix, clip) {
  const names = [];
  for (let i = 0; i < times.length; i++) { const wait = times[i] - (Date.now() - t0); if (wait > 0) await sleep(wait); const n = `${prefix}-${i}.png`; await shot(n, clip); names.push(n); }
  const distinct = new Set(names.map((n) => hashes[n])).size;
  report.strips[prefix] = { frames: names.length, distinct, hashes: names.map((n) => hashes[n]) };
}
/** Same overlap check as shoot-ux.mjs, plus the smallest rendered text size on the stage. */
async function overlapCheck(label) {
  const r = await ev(`(()=>{
    const key=document.querySelector('[data-tour=key]')?.getBoundingClientRect(); const out=[];
    const hit=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    const rail=document.querySelector('.rail')?.getBoundingClientRect(), stage=document.querySelector('.stage')?.getBoundingClientRect();
    if(rail&&stage&&rail.height>0&&rail.bottom>stage.top+1) out.push('rail overlaps stage');
    if(key&&key.width){ for(const t of document.querySelectorAll('.stage-svg text')){const b=t.getBoundingClientRect(); if(b.width&&hit(b,key)) out.push('stage text under key: '+t.textContent.slice(0,30));}
      for(const p of document.querySelectorAll('.stage-svg path.wire')){const len=p.getTotalLength(); const ctm=p.getScreenCTM(); for(let i=0;i<=80;i++){const q=p.getPointAtLength(len*i/80); const x=q.x*ctm.a+ctm.e,y=q.y*ctm.d+ctm.f; if(x>key.left&&x<key.right&&y>key.top&&y<key.bottom){out.push('conduit inside key panel'); break;}}} }
    const rail2=document.querySelector('.rail'); if(rail2&&rail2.clientHeight&&rail2.scrollHeight>rail2.clientHeight+1) out.push('rail content clipped (a toast is hidden)');
    const tx=[...document.querySelectorAll('.stage-svg text')].filter(t=>t.getBoundingClientRect().width); let minPx=99; for(const t of tx){const s=parseFloat(getComputedStyle(t).fontSize)*t.getScreenCTM().a; if(s<minPx) minPx=s;}
    out.push('min stage text px: '+minPx.toFixed(1));
    const sb=document.querySelector('.stage').getBoundingClientRect(); out.push('stage '+Math.round(sb.width)+'x'+Math.round(sb.height));
    return out;})()`);
  report.overlaps.push({ at: label, found: r });
}
const setRange = (v) => ev(`(()=>{const i=document.querySelector('.scrub input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'${v}');i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
const typeIn = (sel, v) => ev(`(()=>{const i=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,${JSON.stringify(v)});i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
const mouse = async (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
const propose = (t) => click("Propose " + t);

try {
  await send("Page.enable"); await send("Runtime.enable");
  if (want("desktop")) for (const [w, h] of [[1440, 900], [1920, 1080]]) {
    const T = `${w}`;
    await load(w, h); await sleep(800);
    await shot(`${T}-you-idle.png`); await overlapCheck(`${T} you idle`);
    await propose("AUTH"); await sleep(2600); await propose("DRAFT"); await sleep(2600);
    await propose("TRANSFER"); await sleep(3000);
    await shot(`${T}-you-blocked-why.png`); await overlapCheck(`${T} you blocked`);
    await ev(`(()=>{const b=document.querySelector('.rcpt-btn.no');b&&b.click();return true})()`); await sleep(400);
    await shot(`${T}-receipt.png`); await overlapCheck(`${T} receipt`);
    await click("Proof"); await sleep(500);
    await typeIn("#whatif-in", "AUTH DRAFT TRANSFER"); await sleep(300);
    await ev(`document.querySelector('[data-testid=whatif]').scrollIntoView({block:'center'});true`); await sleep(300);
    await shot(`${T}-whatif-fail.png`); await overlapCheck(`${T} whatif`);
    await key("Escape"); await sleep(400);
    await setRange(1); await sleep(700);
    await shot(`${T}-replay-scrub.png`); await overlapCheck(`${T} replay`);
    await setRange(2); await sleep(300);
    const orb = await ev(`(()=>{const r=document.querySelector('[data-state=DRAFTED] .orb-ring').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await mouse(orb.x, orb.y); await sleep(500);
    await shot(`${T}-hover-state.png`); await overlapCheck(`${T} hover`);
    await mouse(5, 5);
    // fault: the gate stops answering, then the visitor resets the session
    await ev(`window.fetch=()=>Promise.reject(new TypeError('Failed to fetch'));true`);
    await click("Reset session"); await sleep(1200);
    await shot(`${T}-fault.png`);
  }
  if (want("mobile")) {
    await load(390, 844, { mobile: true }); await sleep(600);
    await shot("390-idle-sheet-down.png");
    await click("Open"); await sleep(600);
    await propose("TRANSFER"); await sleep(3000);
    await shot("390-sheet-open-blocked.png"); await overlapCheck("390 sheet open");
    await click("Hide"); await sleep(600);
    await shot("390-sheet-down-blocked.png");
  }
  if (want("strip")) {
    await load(1440, 900); await sleep(600); await propose("AUTH"); await sleep(2600); await propose("DRAFT"); await sleep(2600);
    const clip = await rectOf(".stage"); const t0 = Date.now(); await propose("TRANSFER");
    await strip(t0, [120, 300, 520, 760, 1000, 1300, 1700, 2400], "strip-you-blocked", clip);
  }
} finally {
  report.hashes = hashes;
  writeFileSync(path.join(outDir, "shoot-report.json"), JSON.stringify(report, null, 1));
  try { await send("Browser.close"); } catch {}
  sock.close(); setTimeout(() => { chrome.kill(); process.exit(0); }, 800);
}
console.log(JSON.stringify({ errors: report.errors, strips: report.strips, overlaps: report.overlaps }, null, 1));