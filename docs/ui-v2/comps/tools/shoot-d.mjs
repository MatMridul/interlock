// Headless Chrome over DevTools for comp-d (one process, closed afterwards). Node 22+.
// usage: node shoot-d.mjs <outDir> <frameDir> [quick]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [, , outDir, frameDir, mode] = process.argv;
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9334, here = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
mkdirSync(outDir, { recursive: true }); mkdirSync(frameDir, { recursive: true });
const profile = path.join(process.env.KIROCREW_SCRATCH || process.env.TEMP, "chrome-comp-d");
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb", "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() { for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" }); return (await r.json()).webSocketDebuggerUrl; } catch { await sleep(200); } } throw new Error("chrome did not start"); }
const sock = new WebSocket(await wsUrl()); await new Promise((r) => (sock.onopen = r));
let id = 0; const pend = new Map(), report = { errors: [], fonts: null, notes: [] };
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === "Runtime.exceptionThrown") report.errors.push(d.params.exceptionDetails.text + " " + (d.params.exceptionDetails.exception?.description || "")); else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") report.errors.push("console.error " + JSON.stringify(d.params.args.map((a) => a.value))); };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result))); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const shot = async (file, clip) => { const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); writeFileSync(file, Buffer.from(r.data, "base64")); };
const url = (q = "") => pathToFileURL(path.join(here, "comp-d.html")).href + q;
const open = async (q) => { await send("Page.navigate", { url: url(q) }); await sleep(800); await ev("document.fonts.ready.then(()=>true)"); await sleep(350); };
const seek = async (k, t, wait = 220) => { await ev(`__comp.seek('${k}',${t})`); await sleep(wait); };
const T = (k, n) => ev(`__comp.at('${k}','${n}')`);

try {
  await send("Page.enable"); await send("Runtime.enable");
  const sizes = mode === "quick" ? [[1440, 900]] : [[1440, 900], [1920, 1080]];
  for (const [w, h] of sizes) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await open("?boot=0");
    report.fonts = await ev("[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight).join(', ')");
    const tag = `comp-d-${w}`;
    await shot(path.join(outDir, `${tag}-idle.png`));
    if (mode === "quick") { await seek("key", 500); await shot(path.join(outDir, `${tag}-key-lifted.png`)); await seek("rejected", (await T("rejected", "shudder")) + 120); await shot(path.join(outDir, `${tag}-rejected-barrier.png`)); break; }
    await seek("allowed", (await T("allowed", "conduit")) + 330); await shot(path.join(outDir, `${tag}-allowed-mid.png`));
    await seek("rejected", (await T("rejected", "suck")) + 250); await shot(path.join(outDir, `${tag}-rejected-mid.png`));
    await seek("rejected", (await T("rejected", "shudder")) + 120); await shot(path.join(outDir, `${tag}-rejected-barrier.png`));
    await seek("key", 560); await shot(path.join(outDir, `${tag}-key-lifted.png`));
    await seek("key", 3300); await shot(path.join(outDir, `${tag}-key-approved.png`));
    await ev("__comp.seek('hard',0)"); await sleep(250); await shot(path.join(outDir, `${tag}-hard-locked.png`));
    if (w === 1440) {
      const rect = await ev(`(()=>{const r=document.getElementById('stage').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
      const strips = { allowed: [150, 480, 900, 1180, 1400, 1650, 1950, 2500], rejected: [150, 560, 1180, 1330, 1560, 1830, 2150, 2400], key: [300, 700, 1100, 1400, 1650, 2100, 2600, 3100] };
      for (const [k, ts] of Object.entries(strips)) for (let i = 0; i < ts.length; i++) { await seek(k, ts[i], 180); await shot(path.join(frameDir, `comp-d-${k}-${i}-${ts[i]}.png`), rect); }
    }
  }
  if (mode !== "quick") {
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    // reduced motion path: emulate the media feature, play allowed, shoot during the 160 ms highlight window
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await open("?boot=1"); const rmBoot = await ev("getComputedStyle(document.getElementById('dark')).opacity"); report.notes.push("reduced-motion: boot overlay opacity " + rmBoot + " (0 = no cold open)");
    await open("?play=rejected"); await sleep(120); await shot(path.join(outDir, "comp-d-1440-reduced-motion-rejected.png"));
    report.notes.push("reduced-motion: canvas packet phases skipped, outcome instant; state after play: " + await ev("document.getElementById('rd').textContent"));
    await send("Emulation.setEmulatedMedia", { features: [] });
    // cold open frames (real time)
    await open("?boot=1");
    for (let i = 0; i < 4; i++) { if (i) await sleep(650); await shot(path.join(frameDir, `comp-d-boot-${i}.png`)); }
    // sound: flip the toggle (a real click is a user gesture), check the audio context starts and the cues run
    await open("?boot=0");
    await ev("document.getElementById('tg-snd').click()"); await sleep(300);
    report.notes.push("audio: ctx state after toggle = " + await ev("CORE.Snd.ctx && CORE.Snd.ctx.state") + ", on=" + await ev("CORE.Snd.on"));
    report.notes.push("audio: cues ran without exception = " + await ev("(()=>{try{for(const n of ['allowed','blocked','needs-human','approved']) CORE.Snd.play(n);return true}catch(e){return String(e)}})()"));
    // collapsed dock
    await ev("document.getElementById('dock-t').click()"); await sleep(300); await shot(path.join(outDir, "comp-d-1440-dock-collapsed.png"));
    // perf: ms per render in a rejected sequence (CPU only, headless)
    await ev("document.getElementById('dock-t').click()"); await sleep(200);
    report.notes.push("render ms (mean of 40 seeks, rejected suck phase) = " + await ev("(()=>{const t0=performance.now();for(let i=0;i<40;i++)__comp.seek('rejected',2000+i*5);return ((performance.now()-t0)/40).toFixed(2)})()"));
  }
} finally {
  writeFileSync(path.join(frameDir, "comp-d-report.json"), JSON.stringify(report, null, 1));
  try { await send("Browser.close"); } catch { }
  sock.close(); setTimeout(() => { chrome.kill(); process.exit(0); }, 800);
}
console.log(JSON.stringify(report));
