// Headless Chrome over the DevTools protocol (Node 22+ built-in WebSocket). One process at a time.
// usage: node shoot.mjs <comp-a|comp-b|comp-c> <stageSelector> <outDir> <frameDir>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [, , comp, stageSel, outDir, frameDir] = process.argv;
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333, here = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
mkdirSync(outDir, { recursive: true }); mkdirSync(frameDir, { recursive: true });
const profile = path.join(process.env.KIROCREW_SCRATCH || process.env.TEMP, "chrome-" + comp);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu-vsync", "--hide-scrollbars", "--force-color-profile=srgb", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ws() {
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" }); const j = await r.json(); return j.webSocketDebuggerUrl; } catch { await sleep(200); } }
  throw new Error("chrome did not start");
}
const url = await ws(); const sock = new WebSocket(url); await new Promise((r) => (sock.onopen = r));
let id = 0; const pend = new Map();
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result))); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const shot = async (file, clip) => { const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); writeFileSync(file, Buffer.from(r.data, "base64")); };
const target = pathToFileURL(path.join(here, comp + ".html")).href;
const name = { "comp-a": "A", "comp-b": "B", "comp-c": "C" }[comp];
const report = { comp, errors: [], fonts: null };

try {
  await send("Page.enable"); await send("Runtime.enable");
  sock.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") report.errors.push(d.params.exceptionDetails.text + " " + (d.params.exceptionDetails.exception?.description || "")); if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") report.errors.push("console.error " + JSON.stringify(d.params.args.map((a) => a.value))); });
  for (const [w, h] of [[1440, 900], [1920, 1080]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: target }); await sleep(900);
    await ev("document.fonts.ready.then(()=>true)"); await sleep(400);
    report.fonts = await ev("[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight+' '+f.style).join(', ')");
    const tag = `${comp}-${w}`;
    await shot(path.join(outDir, `${tag}-idle.png`));
    const T = async (k, n) => ev(`__comp.at('${k}','${n}')`);
    await ev("__comp.seek('allowed',"+((await T("allowed", "conduit")) + 330)+")"); await sleep(250);
    await shot(path.join(outDir, `${tag}-allowed-mid.png`));
    await ev("__comp.seek('rejected',"+((await T("rejected", "suck")) + 250)+")"); await sleep(250);
    await shot(path.join(outDir, `${tag}-rejected-mid.png`));
    await ev("__comp.seek('rejected',"+((await T("rejected", "shudder")) + 120)+")"); await sleep(250);
    await shot(path.join(outDir, `${tag}-rejected-barrier.png`));
    if (w === 1440) {
      const rect = await ev(`(()=>{const r=document.querySelector('${stageSel}').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
      const strips = { allowed: [150, 480, 900, 1180, 1400, 1650, 1950, 2500], rejected: [150, 560, 1180, 1330, 1560, 1830, 2150, 2400] };
      for (const [k, ts] of Object.entries(strips)) {
        for (let i = 0; i < ts.length; i++) { await ev(`__comp.seek('${k}',${ts[i]})`); await sleep(180); await shot(path.join(frameDir, `${comp}-${k}-${i}-${ts[i]}.png`), rect); }
      }
    }
    await ev("__comp.seek('hard',0)"); await sleep(250);
    await ev("(document.getElementById('tg-proof')||document.querySelector('[data-proof]'))&&(document.getElementById('tg-proof')||document.querySelector('[data-proof]')).click()"); await sleep(500);
    await shot(path.join(outDir, `${comp}-${w}-hard-locked-proof.png`));
  }
  // narrow
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: target }); await sleep(900); await ev("document.fonts.ready.then(()=>true)"); await sleep(400);
  await shot(path.join(outDir, `${comp}-390-idle.png`));
  await ev("__comp.seek('rejected',2200)"); await sleep(250); await shot(path.join(outDir, `${comp}-390-rejected.png`));
} finally {
  writeFileSync(path.join(frameDir, comp + "-report.json"), JSON.stringify(report, null, 1));
  try { await send("Browser.close"); } catch {}
  sock.close(); setTimeout(() => { chrome.kill(); process.exit(0); }, 800);
}
console.log(JSON.stringify(report));
