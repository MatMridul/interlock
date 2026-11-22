# DRAFTS_REPORT (item it_3f1b70b7)

All files are new drafts. Nothing committed or pushed, no Bedrock calls, no existing file edited, no LICENSE added. No file collided with an existing name, so no `-draft` names were needed. The full test suite was not run (memory); only `pytest --collect-only` and JSON/Archify validation.

## Files created
| File | Purpose |
| :-- | :-- |
| `.kiro/specs/gate/requirements.md` | 9 requirements, EARS style, numbered acceptance criteria |
| `.kiro/specs/gate/design.md` | architecture, components, S1-S10/X1 and INV-1..12 mapped to real test names |
| `.kiro/specs/gate/tasks.md` | checklist; build items ticked, UI/deploy/license/video/submit open |
| `.kiro/steering/product.md` | what it is, honesty rules (`inclusion: always`) |
| `.kiro/steering/tech.md` | stack, generated-table rule, import rule, test commands |
| `.kiro/steering/security.md` | no-secrets and safe defaults |
| `.kiro/hooks/policy-checks-on-save.json` | save hook: exhaustive + mutation tests, table `--check` |
| `README.md` | no README existed |
| `docs/submission/KIRO_WRITEUP.md` | Kiro-usage narrative |
| `docs/submission/VIDEO_SCRIPT.md` | timed script (2:55 incl. closing card; 2:45 without) |
| `docs/submission/DEVPOST_DRAFT.md` | Devpost text and checklist |
| `docs/submission/BLOG_OUTLINE.md` | outline plus about 600-word draft |
| `docs/architecture/architecture.spec.json`, `architecture.html` | Archify diagram; validate and deliver passed (showcase); screenshot checked by eye |
| `docs/submission/DRAFTS_REPORT.md` | this file |

## Verified against kiro.dev (fetched today)
- Specs: three files `requirements.md`/`design.md`/`tasks.md`, EARS `WHEN ... THE SYSTEM SHALL`, Requirements-First flow (specs, feature-specs, best-practices pages).
- Steering: `.kiro/steering/*.md`, front matter `inclusion: always | fileMatch | manual | auto`; `always` used.
- Hooks: `.kiro/hooks/<id>.json`, `version: "v1"`, `hooks[]` with `name`, `trigger`, `matcher` (regex on file path for file events), `action.type/command`, optional `timeout`, `enabled`, `description`.

## Could not verify
- Exact JSON trigger name for file save. The hooks overview example uses `PostFileSave`; the triggers page lists "File Save" without JSON names; `SPEC_GATE_v2.md` says `FileSave`. I used `PostFileSave`. If the hook does not fire, try `FileSave`. The docs say the File Save trigger fires when the agent saves files; whether a manual save in the IDE fires it is unverified.
- Matcher escaping on Windows paths (I allow `/` or `\`); the hook was not run inside Kiro. The command uses the Windows venv path and needs jflap-cli and Java.
- Exact `tasks.md` checkbox grammar beyond `- [ ]`/`- [x]` (docs page did not show it; from general knowledge).
- Kiro hook STDIN fields (unread, not needed).
- Not verified: that the specs/steering/hook were authored in the Kiro IDE (they were written by a helper); that Kiro loads `.kiro/settings/mcp.json` with the repo-relative path `third_party/jflap-cli/jflap_mcp.py`.
- Not re-run: the full pytest suite and `npm test`; test counts are from reports and collect-only. Browser view of the diagram was a headless screenshot only.

## Owner must decide or supply
- License choice (none added); third-party license texts (JFLAP, Strands, others marked "check").
- GitHub repo name and public repo; first commits of all current files (almost everything is untracked).
- Final UI look (comp D leading) and then screenshots, video actions (the Autoplay demo and key sequence exist only in the comp D prototype, not in the React UI).
- Bonus prizes (Student, Best Kiro Crew App, Best Demo, Blog, Social): eligibility unread.
- Devpost Rules, Resources and FAQ tabs: never read (list in `DEVPOST_DRAFT.md`).
- Deploy host and a public URL (none exists).
- Whether the claims in the write-up about Kiro usage (MCP called from Kiro, specs made in Kiro) are true.
- Claude access in Bedrock (use-case form) if the owner wants a Claude run.

## Inconsistencies found in the repo
- `.gitignore` does not ignore `.hypothesis`, `.pytest_cache`, or `scripts/bedrock_calls.log` (the first two appear in the repo root). `.kiro` is not ignored (checked with `git check-ignore`).
- `server/config.py` holds a default demo MFA code in source (UI_REPORT says it is not in UI source; it is in `ui/README.md` and `server/config.py`). Consider requiring the env var for a public repo. I did not write the value anywhere.
- Test counts: superseded; see docs/reports/TEST_COUNTS.md.
- `.kiro/settings/mcp.json` uses a machine-specific absolute path; it will not work for others.
- `SPEC_GATE_v2.md` section 10/1 lists the hook trigger as `FileSave`; current docs overview shows `PostFileSave`.
- `SPEC_GATE.md` (v1) and `CHIMERIC_AUTOMATON_SPEC.md` remain with the superseded claims; fine if labelled, risky for judges reading the repo.
- `SPEC_GATE_v2.md` section 7 named the old UI framework; the UI is Vite (docs/ui-v2/UI_BUILD_REPORT.md).
- EXECUTOR_REPORT says full suite is 87 s while VERIFICATION_REPORT's "about 3 s" applies only to M1/M4; hook uses only the 3 s tests.
- Docs checklist items "ROUND_2": `shoot.mjs` looks for `#tg-proof`, absent in comp D (already stated there).
