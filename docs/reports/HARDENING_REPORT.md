# Hardening report (A2 to A9, E4, F1)

Branch `hardening-ci` (from `ui-instrument` at `f88f543`), worktree `C:\Mridul\Programs\Kiroween-wt\hardening`. Nothing pushed or merged. Run on Windows, Python 3.12.10, Java 27.0.1, Node 24.19.0, 2026-11-21.

## What changed, by task

| Task | Change |
| :-- | :-- |
| A2 | `jflap-cli` vendored into `third_party/jflap-cli` (CLI, MCP server, bridge client, builder, `JFLAPBridge.java`, LICENSE; no git history, no examples or coursework). JFLAP 7.1 jar bundled (see License findings). `.kiro/settings/mcp.json`, `.kiro/hooks/policy-checks-on-save.json`, `scripts/gen_executor_table.py` and `tests/test_replay_m5.py` use repo-relative paths; `JFLAP_CLI` env var overrides the CLI path in the script and the replay test (the MCP json has no env override). Absolute paths also removed from reports and old specs. `*.class` is git-ignored; the bridge compiles on first use (needs a JDK). |
| A2 (bug found) | `gen_executor_table.py --check` and `tests/test_gen_table.py` compared bytes, so a Windows checkout with `core.autocrlf=true` always reported "stale". Both now read in text mode. |
| A3 | `scripts/setup.py` (stdlib only): venv, `pip install -r requirements.txt`, `npm ci` and build, Java check, prints the run command per OS. README quick-start and Verify sections replaced inside `<!-- quick-start:begin/end -->` markers. |
| A4 | `.github/workflows/ci.yml`: fast Python tests, slow suites (push to main only), UI tests and build, table freshness, secret scan, pip-audit and npm audit (report-only via `continue-on-error`). Actions pinned: `actions/checkout@v4.2.2`, `setup-python@v5.6.0`, `setup-node@v4.4.0`, `setup-java@v4.7.1`. `scripts/secret_scan.py` plus `tests/test_secret_scan.py` (regexes documented in the script's docstring; prints file:line:rule only). |
| A5 | Slow suites run locally; `docs/reports/TEST_COUNTS.md` holds the counts and commands. |
| A6 | Counts 334, 336, 320, 258 and "20 UI tests" removed from README, reports, drafts and `.kiro/specs` (they point to TEST_COUNTS.md). "Next.js" replaced with "React (Vite)" in the old specs, which now carry a "Superseded" banner. Left on purpose: `docs/OPEN_TASKS.md` (not mine to edit) and the unrelated numbers 320 ms and 335 in `MOTION_GRAMMAR.md` and `architecture.html`. |
| A6 (not done) | `UI_REPORT.md` and `docs/screens/` are untracked and exist only in the main folder (`C:\Mridul\Programs\Kiroween`). I did not touch the main folder. They are not in this branch. Delete them there by hand (`git status` shows both as `??`). |
| A7 | `BACKEND`, `EXECUTOR`, `STRANDS`, `VERIFICATION` reports moved with `git mv` to `docs/reports/`; index in `docs/reports/README.md`; links fixed in README, `.kiro/specs/gate`, docs, `server/app.py` and test docstrings. Old `UI_REPORT.md` links now point to `docs/ui-v2/UI_BUILD_REPORT.md`. The root still holds the v1 specs (`01_` to `03_`, `CHIMERIC_AUTOMATON_SPEC.md`, `SPEC_GATE*.md`), now marked superseded; moving them was not asked for. |
| A8 | `THIRD_PARTY.md`: every direct Python and npm dependency, fonts, JFLAP 7.1, jflap-cli, Strands SDK, Bedrock models, with license id and where read. Bedrock, Nova 2 Lite, Claude and the JDK are `unread`. Transitive dependencies are not covered. |
| A9 | "Provenance" section in `THIRD_PARTY.md`. This repo's first commit is 2026-11-15 (`2e2b40c`); `jflap-cli` first commit 2026-11-13 (from its own git log). README points to it. The 2026-11-13 date is earlier than this repo's start, which is also a rules question (below). |
| E4 | `server/limits.py` (in-memory). POST `/session/{id}/mfa`: 5 wrong codes lock that session for 300 s (even the right code returns 429 during lockout); 20 wrong codes within 600 s from one client lock that client for 300 s (covers new-session resets); 30 attempts per 60 s per client. `/session` and `/chat`: 30 requests per 60 s per client. 429 with `Retry-After`. Settings in `server/config.py`. |
| F1 | `INTERLOCK_ENV=production` makes `create_app()` (and the module-level `app`) raise `RuntimeError` unless `DEMO_MFA_CODE` is non-empty. The code is never printed when set; the local default still prints a random 6-digit code to stderr. Tests in `tests/test_server_limits.py`. |

Tests added: `tests/test_server_limits.py` (7: brute-force lockout, reset on success, per-client limit across new sessions, rate limits, production refusal, production no-print, local default), `tests/test_secret_scan.py` (2). `tests/test_server_api.py::make_client` passes a relaxed limiter so existing tests are unaffected.

## Commands run and results (from the worktree, after the last code change)

| Command | Result |
| :-- | :-- |
| `python -m pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py` | 329 passed (24 s) |
| `python -m pytest -q tests/test_mutation_m3.py tests/test_replay_m5.py` | 16 passed (86 s; 14 mutation + 2 replay, run separately earlier: 115 s and 3.5 s) |
| `python scripts/gen_executor_table.py --check` | exit 0 (vendored tool) |
| `python scripts/secret_scan.py` | 0 findings |
| `cd ui && npm ci && npm test && npm run build && npm audit` | 26 passed; build ok; 0 vulnerabilities |
| `pip-audit -r requirements.txt` (clean venv from `scripts/setup.py --no-ui`) | no known vulnerabilities |
| `python scripts/setup.py --no-ui` | exit 0, created a clean venv and installed requirements |
| CI YAML parsed with PyYAML | 6 jobs: python-fast, python-slow, ui, executor-table, secret-scan, audit |

Python tests use the main folder's venv (`C:\Mridul\Programs\Kiroween\.venv`). Counts are in `docs/reports/TEST_COUNTS.md`.

## Commits (`git log --oneline ui-instrument..hardening-ci`, this report is one more commit after these)

```
68f0bb7 Avoid key literal in secret scan test
9f2fdda Point README third-party section to file
6abe3c8 Add THIRD_PARTY.md with provenance
aa85083 Mark old specs superseded, drop Next.js
7939870 Point drafts at test counts file
8407726 Fix report links and remove test counts
ffbf45b Add test counts and reports index
a791259 Move root reports into docs/reports
39de6ed Add GitHub Actions CI workflow
1b4da85 Add repository secret scan script
08b4011 Test lockout, rate limits, production mode
a36eb6e Apply limits to session, chat, mfa
1bb1528 Add in-memory rate limiter module
9b45a08 Add production mode and limit settings
1045949 Add setup script and cross-platform quick start
fb13416 Make save hook command cross-platform
c40c97d Use repo-relative paths in Kiro config
78c3506 Use vendored jflap-cli in scripts and tests
771ccb3 Bundle JFLAP 7.1 jar with license
076c09a Vendor jflap-cli sources into third_party
```

## License findings

- The JFLAP 7.1 license (read from the copy shipped with jflap-cli and from the official page, July 27, 2018 version) permits distributing unmodified copies if the license text is included and no fee is charged for any product that includes any part of JFLAP. The vendored jar's SHA-256 equals the file downloaded from `https://www.jflap.org/jflaptmp/july27-18/JFLAP7.1.jar` today, so it is unmodified. I therefore bundled it, with the official license text beside it. `scripts/fetch_jflap.py` was not needed: `jflap_bridge_client.py` already re-downloads the jar from that URL if it is missing.
- Constraint for the owner: nothing that includes the jar may be sold or charged for. Check this against any prize or commercial plans. The license is custom, not OSI-approved; the top-level repo license is still not chosen.
- Hypothesis is MPL-2.0 (a dev/test dependency, not modified or bundled). Strands SDK and boto3 are Apache-2.0. The rest are MIT or BSD-3-Clause. UI fonts are SIL OFL 1.1.

## Could not verify

- The real CI run (Actions cannot run locally). The Linux JFLAP path is untested: the bridge compiles `JFLAPBridge.java` with `javac` and uses a `:` classpath on Linux; only Windows was run. The fast job and the table-freshness job both call JFLAP, so they need Java on the runner (added via `setup-java`).
- macOS and Linux for `scripts/setup.py` and the README commands; only Windows was run.
- That Kiro loads the repo-relative `mcp.json` path (Kiro was not opened); the hook trigger name (task A10) is unchanged.
- Rate limits behind a proxy: the client key is the socket address, so all users behind one proxy share a limit (noted in `server/limits.py`). State is per process.
- Transitive dependency licenses, and the terms of Bedrock and the Nova model.

## Owner decisions

1. Whether the no-fee condition of the JFLAP license is acceptable for the submission and any later use.
2. Whether `jflap-cli` (first commit 2026-11-13) and this repo's own first commit (2026-11-15) satisfy the "new project" rule; read the Devpost rules. `THIRD_PARTY.md` states the dates and does not interpret the rule.
3. Delete the stale untracked `UI_REPORT.md` and `docs/screens/` in the main folder.
4. Choose the repo license (README still says "not chosen").
5. After merge, set `DEMO_MFA_CODE` and `INTERLOCK_ENV=production` in any deployment; the rate limiter needs a trusted proxy setup if deployed behind one.
