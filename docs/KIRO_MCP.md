# JFLAP MCP server and the `jflap` power

Two ways to give a Kiro agent the JFLAP checks. Both start the same server, `third_party/jflap-cli/jflap_mcp.py` (vendored, MIT; see `third_party/jflap-cli/VENDORED.md`). It speaks MCP over stdio and exposes 13 tools (`jflap_inspect`, `jflap_simulate`, `jflap_simulate_batch`, `jflap_trace`, `jflap_export_table`, `jflap_equivalence_check`, `jflap_fsa_operation`, and others).

## Requirements

- Python 3.8+ as `python` on PATH, Java 8+ (`java -version`) and a JDK with `javac` (the bridge class is compiled on first use).
- Run Kiro from the repository root. The server path is relative (`third_party/jflap-cli/jflap_mcp.py`).

## A. Project MCP config (verified live)

`.kiro/settings/mcp.json` already declares the server as `jflap` and auto-approves six read-only tools. Kiro CLI and the IDE read it from the workspace. This is what the custom agent `gate-verifier` uses (`"includeMcpJson": true`, tool `@jflap`). It was used for real: `docs/evidence/gate_verifier_run3_pass.txt` shows `@jflap/jflap_inspect` and `@jflap/jflap_equivalence_check` called from `kiro-cli chat --agent gate-verifier`.

## B. The `jflap` power (`powers/jflap/`, format from the docs, install not run)

A power is a directory with a `plugin.json` manifest, an optional `mcp.json` and optional `skills/` ([Create powers](https://kiro.dev/docs/powers/create/), [Powers overview](https://kiro.dev/docs/powers/)). `powers/jflap/` follows that layout:

```
powers/jflap/
  plugin.json                       name, version, description, author, keywords (activation words)
  mcp.json                          the jflap stdio server
  skills/verify-policy/SKILL.md     the steps for verifying a policy
```

Install (from the install docs, [Install powers](https://kiro.dev/docs/powers/installation/)): Kiro IDE, Powers panel, Add Custom Power, Import power from a folder, choose `powers/jflap`. Kiro CLI 3.5.0 has `kiro-cli powers install <NAME_OR_PATH>` (seen in `kiro-cli powers --help`).

What was NOT verified, so nothing here claims it works:

- The install was not run. It would add a server to the owner's real Kiro configuration, and an isolated home directory did not work with the CLI ("home directory not found"). The manifest was written from the documented fields only; there is no local validator for `plugin.json`.
- The power's `mcp.json` uses the same relative path as the project config. The docs do not say what working directory a power's server starts in. If it is not the repository root, the power needs an absolute path; the project config (A) does not have this problem.
- Activation by keyword (for example "automaton", "dfa") was not tried.

## Why both

The project config is the reliable path for this repository and for the judges. The power shows the packaging format and would let the JFLAP checks travel to another project once the working-directory question is settled.
