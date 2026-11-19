---
inclusion: always
---

# No secrets, safe defaults

- Never write secrets, AWS keys, account IDs, tokens or credentials into any file, log, test or doc. Credentials come from the boto3 chain (`aws login` / `aws configure`); do not read credential files.
- The demo MFA code comes from env `DEMO_MFA_CODE`. Do not print it in docs, UI source or videos. There is no default code in source: if the env var is unset the server makes a random one per run and prints it on the server console only.
- `.env` stays git-ignored. `scripts/bedrock_calls.log` and raw run JSON must stay free of secrets.
- Bind servers to `127.0.0.1` only: `uvicorn server.app:app --host 127.0.0.1 --port 8000`.
- `STUB=1` (canned model) is off unless the value is exactly `1`. Never enable it in a deployed build.
- No real Bedrock calls in automated tests. Cap manual calls and `maxTokens`.
- Real tools are stubs: no network, no money movement. Keep it that way.
- The UI must render model text as plain text, never HTML. No external requests, CDNs or analytics.
