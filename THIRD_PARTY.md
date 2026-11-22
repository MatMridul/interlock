# Third-party software and assets

Read on 2026-11-21. "Where read" names the file or metadata the license was taken from. Anything not read is marked `unread`; nothing here is guessed. Only direct dependencies are listed (the lines of `requirements.txt`, `ui/package.json`, and bundled assets). Transitive dependencies are not covered.

## Bundled in this repository

| Name | Version | License | Where read | Notes |
| :-- | :-- | :-- | :-- | :-- |
| JFLAP | 7.1 (jar dated 2018-07-27) | JFLAP 7.1 License (Susan H. Rodger, Duke University; custom text) | `third_party/jflap-cli/third_party/jflap/LICENSE-JFLAP`, copied from https://www.jflap.org/jflaptmp/july27-18/license.html | Unmodified jar (SHA-256 `A22C095DDC56B18163E8EBEEEF165B3A04CB570F35EB46B96105166E06C99406`, identical to the official download). The text allows distributing unmodified copies if the license text is included and no fee is charged for any product that includes JFLAP. Do not sell or charge for this repository or anything that includes the jar. The authors' name may not be used to endorse the product. |
| jflap-cli (CLI, MCP server, JVM bridge) | 1.0.0 | MIT, (c) 2026 Mridul Mathur | `third_party/jflap-cli/LICENSE`, `pyproject.toml` of the source project | The owner's own tool, pre-existing (first commit 2026-11-13). Only the runtime files were copied; see `third_party/jflap-cli/VENDORED.md`. |
| Barlow Condensed (UI font, 3 weights) | as shipped in `ui/src/assets/fonts` | SIL Open Font License 1.1 | `ui/src/assets/fonts/LICENSE-barlow-condensed.txt` | Copyright 2017 The Barlow Project Authors. |
| IBM Plex Mono (UI font, 3 weights) | as shipped in `ui/src/assets/fonts` | SIL Open Font License 1.1 | `ui/src/assets/fonts/LICENSE-ibm-plex-mono.txt` | Copyright 2017 IBM Corp. |
| B612, B612 Mono, EB Garamond, IM Fell English (design comps only, `docs/ui-v2/comps/fonts`; not used by the shipped UI) | as shipped | SIL Open Font License 1.1 | `docs/ui-v2/comps/fonts/LICENSE-*.txt` (first lines read: B612 and B612 Mono, EB Garamond, Barlow Condensed, IBM Plex Mono, IM Fell English) | IM Fell English license file names the copyright holder only as "Google Inc."; the OFL statement is present. |

## Python (`requirements.txt`, installed into a clean venv and read from package metadata)

| Name | Version | License | Where read |
| :-- | :-- | :-- | :-- |
| anyio | 4.16.0 | MIT | `anyio-4.16.0.dist-info/licenses/LICENSE`, metadata `License-Expression` |
| boto3 | 1.44.6 | Apache-2.0 | `boto3-1.44.6.dist-info/LICENSE` (Apache License 2.0 text), metadata `License` |
| fastapi | 0.165.0 | MIT | `fastapi-0.165.0.dist-info/licenses/LICENSE` |
| httpx | 0.28.1 | BSD-3-Clause | `httpx-0.28.1.dist-info/licenses/LICENSE.md`, metadata `License` |
| hypothesis | 6.170.15 | MPL-2.0 | `hypothesis-6.170.15.dist-info/licenses/LICENSE.txt` (states MPL 2.0 apart from marked exceptions), metadata `License-Expression` |
| pydantic | 2.14.4 | MIT | `pydantic-2.14.4.dist-info/licenses/LICENSE` |
| pytest | 9.2.0 | MIT | `pytest-9.2.0.dist-info/licenses/LICENSE` |
| starlette | 1.10.0 | BSD-3-Clause | `starlette-1.10.0.dist-info/licenses/LICENSE.md`, metadata `License-Expression` |
| strands-agents (Strands Agents SDK) | 1.65.0 | Apache-2.0 | `strands_agents-1.65.0.dist-info/licenses/LICENSE` (Apache License 2.0 text) and `NOTICE`, metadata classifier |
| uvicorn | 0.54.0 | BSD-3-Clause | `uvicorn-0.54.0.dist-info/licenses/LICENSE.md`, metadata `License-Expression` |

Not installed from `requirements.txt` and not bundled: `pip-audit` (CI only, report-only audit). Its license is `unread`.

## npm (`ui/package.json`, `license` field of each installed `package.json`, plus the license file)

| Name | Version | Kind | License | Where read |
| :-- | :-- | :-- | :-- | :-- |
| react | 19.3.1 | runtime | MIT | `node_modules/react/package.json`, `LICENSE` |
| react-dom | 19.3.1 | runtime | MIT | `node_modules/react-dom/package.json`, `LICENSE` |
| @testing-library/jest-dom | 8.0.0 | dev | MIT | package.json `license`, `LICENSE` file present |
| @testing-library/react | 16.3.3 | dev | MIT | package.json `license`, `LICENSE` file present |
| @testing-library/user-event | 14.6.13 | dev | MIT | package.json `license`, `LICENSE` file present |
| @types/react | 19.3.0 | dev | MIT | package.json `license`, `LICENSE` file present |
| @types/react-dom | 19.3.0 | dev | MIT | package.json `license`, `LICENSE` file present |
| @vitejs/plugin-react | 6.3.0 | dev | MIT | package.json `license`, `LICENSE` file present |
| jsdom | 31.0.1 | dev | MIT | package.json `license`, `LICENSE.txt` file present |
| typescript | 7.0.2 | dev | Apache-2.0 | package.json `license`, `LICENSE` file present |
| vite | 8.3.8 | dev | MIT | package.json `license`, `LICENSE.md` file present |
| vitest | 5.1.1 | dev | MIT | package.json `license`, `LICENSE.md` file present |

The `license` fields were read from all twelve packages; the license file text itself was confirmed to exist but only its name was checked for the dev entries.

## Services and models (not bundled)

| Name | Use | License / terms | Where read |
| :-- | :-- | :-- | :-- |
| Amazon Bedrock | Runtime model access | AWS terms | `unread` |
| Amazon Nova 2 Lite (`global.amazon.nova-2-lite-v1:0`) | The model used in the recorded real run | AWS terms | `unread` |
| Anthropic Claude Haiku 4.5 | Targeted but blocked by the Bedrock use-case form; not used | Anthropic terms via AWS | `unread` |
| Java (JDK) | Runs JFLAP and the bridge; installed by the user | not bundled | `unread` |

## Provenance

- First commit of this repository: 2026-11-15 (`2e2b40c`, "init Kiroween repo with spec files and .kiro MCP binding to jflap-cli"), read with `git log --reverse`.
- Pre-existing, not built for this entry: JFLAP 7.1 (Duke University, 2018 release of the long-running JFLAP project) and `jflap-cli`, the owner's own wrapper, whose first commit is 2026-11-13 (read from its git history). Only the runtime files of `jflap-cli` are vendored; its history and unrelated coursework examples are not included.
- Built after the first commit of this repository (2026-11-15 to date) for Kiroween 2026: the policy model `policy/finance.jff` and its verification, the executor table generator and gate (`bank/`), the Strands agent layer (`agent/`), the FastAPI backend (`server/`), the Instrument UI (`ui/`), the tests, specs, steering, hooks, reports and these hardening changes.
- Whether 2026-11-13 and 2026-11-15 fall inside the hackathon's allowed project window was not checked here; the Devpost rules decide that.
