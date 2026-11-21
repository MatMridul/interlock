# INTERLOCK UI (Instrument)

Vite + React + TypeScript, hand-built SVG stage, CSS and Web Animations API. No CDN, no external requests; fonts are self-hosted in `src/assets/fonts` (OFL licences included). The automaton geometry comes from `GET /policy`; only per-state screen positions live in the UI.

```
cd ui; npm ci; npm run build; cd ..
$env:DEMO_MFA_CODE = "<choose a code>"   # typed on the on-screen key keypad; the UI never shows it
$env:STUB = "1"                           # optional: canned model, no Bedrock
.venv\Scripts\python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000. Dev: `npm run dev` (127.0.0.1:5173, proxies to :8000).

- `npm test`: 26 Vitest tests (SSE parser, reducer, event queue, scoreboard, stage highlighting).
- `npm run build`: type-check plus bundle (about 87 KB gzipped JS).
- `node scripts/contrast.mjs`: WCAG ratios over the tokens in `src/styles.css`.
- Keys: 1 to 6 send the attack vectors. Sound and haptics are off by default.

Full report: `docs/ui-v2/UI_BUILD_REPORT.md`.
