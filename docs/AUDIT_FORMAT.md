# Audit log format (JSON lines)

The "Export audit log" button in the Proof drawer downloads one file, `interlock-audit-<session>.jsonl`. It is built in the browser from what the server sent (the executed log from `GET /session/{id}/state` and the verdict events). Nothing is invented: a field the server did not send is left out.

One JSON object per line, UTF-8. Schema id: `interlock-audit/1`.

## Line types

| `type` | When | Fields |
|---|---|---|
| `session` | first line, once | `schema` (`"interlock-audit/1"`), `session_id`, `exported_at` (ISO 8601, browser clock) |
| `verdict` | one per gate decision, in the order they landed | `n` (1-based), `actor` (`agent` or `human`), `symbol`, `verdict` (`ACCEPT` or `REJECT`), `state_before`, `state_after` (equals `state_before` on REJECT), and only when sent: `reason`, `layer` (`gate` or `hook`), `latency_ms` |
| `executed` | one per entry of the server's executed log (what actually ran) | `n` (1-based), `symbol`, and only when present: `args`, `source` |

## Reading it

- The `executed` lines are the source of truth for side effects. A `verdict` line with `REJECT` never has a matching `executed` line.
- `latency_ms` is the gate decision time measured by the server (`time.perf_counter`). Human approvals carry none.
- `exported_at` and `state_before` come from the browser; the server sends neither.
- The file holds no MFA code and no secrets. `args` of an executed transfer are the payee and amount the gate used.

## Example

```json
{"type":"session","schema":"interlock-audit/1","session_id":"3f2a...","exported_at":"2026-11-22T05:00:00.000Z"}
{"type":"verdict","n":1,"actor":"agent","symbol":"AUTH","verdict":"ACCEPT","state_before":"START","state_after":"AUTHED","layer":"gate","latency_ms":0.0123}
{"type":"verdict","n":2,"actor":"agent","symbol":"TRANSFER","verdict":"REJECT","state_before":"AUTHED","state_after":"AUTHED","reason":"TRANSFER not allowed in AUTHED","layer":"gate","latency_ms":0.0098}
{"type":"executed","n":1,"symbol":"AUTH","source":"llm"}
```