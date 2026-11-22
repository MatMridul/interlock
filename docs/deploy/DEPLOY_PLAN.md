# Deploy plan: Interlock on AWS at minimum cost

Status: prepared on branch `deploy-prep`. **Nothing has been created on AWS.** Every AWS call made while preparing was read-only (`validate-template`, `get-account-settings`, `get-service-quota`). The owner approves, then the conductor runs the commands in section 5.

Public rule to meet: one working public URL that judges can use free and without restriction until 2027-01-29 1 PM PT.

## 1. Architecture in plain words

One AWS Lambda function runs the existing FastAPI app. The AWS Lambda Web Adapter (a published layer) lets the unchanged app listen on a local port while Lambda hands it requests. A Lambda Function URL gives the function one public HTTPS address, with response streaming switched on so the chat SSE stream works. The same function serves the built UI, so the UI and the API share one address (no CORS needed). Session state (gate state, guard counters, MFA lockout, executed log) is kept in one DynamoDB table, so any Lambda instance can serve any request. Items expire after 24 hours (DynamoDB TTL, also enforced on read). The default public mode is `off`: no Bedrock call can happen, and the Bedrock IAM permission is not even attached.

```
 judge's browser
       | HTTPS (one URL)
       v
 Lambda Function URL (auth NONE, RESPONSE_STREAM)
       v
 Lambda function, python3.12, arm64, 512 MB
   [Web Adapter layer] --> uvicorn --> FastAPI app (server/app.py)
                                         | serves ui/dist (same origin)
                                         | rate limits keyed by caller IP (x-amzn-request-context)
                                         v
                      DynamoDB table (provisioned 20 RCU / 20 WCU, TTL)
                         s#<session>  gate snapshot + version + lease + MFA lockout
                         cap#<UTC day> atomic counter of model calls
                                         |  only if Mode=bedrock
                                         v
                                 Bedrock (one model, daily cap)
 CloudWatch Logs: 7-day retention     AWS Budgets: monthly budget, email alert
```

How the new pieces behave (code on this branch):

| Piece | File | Behaviour |
| :-- | :-- | :-- |
| Store | `server/store.py` | `MemoryStore` (default, tests, local) and `DynamoStore`, picked by `INTERLOCK_STORE`. Writes carry a version number and are conditional, so two requests holding the same version cannot both write. A lease serialises chat turns across instances. |
| Shared registry | `server/persist.py` | Used only when a store is configured. Gate state is restored from the store on each request and written back after each chat turn and each MFA attempt (up to 5 retries on a lost race, then HTTP 409 `session busy`). |
| Mode and cap | `server/modelcap.py` | `INTERLOCK_MODEL=off` (default in production): chat returns 403 and no model is built into a call path. `bedrock`: every model call first increments the day's counter with a conditional DynamoDB update; at the cap the call is refused with "The daily limit of real-model calls is used up. Try again after 00:00 UTC." |
| Client address | `server/config.py` | With `INTERLOCK_TRUST_PROXY=lambda` the rate limiter uses `http.sourceIp` from the `x-amzn-request-context` header the Web Adapter adds. Without it every visitor would share the adapter's `127.0.0.1` and one visitor could lock out all others. |
| MFA lockout | `server/limits.py` | Per-session wrong-code count and lockout are saved in the session item, so an attacker cannot reset them by landing on another instance. Per-client request-rate counters stay in each instance's memory (see risks). |

Packaging: a zip (no container, so no ECR storage) plus the published Web Adapter layer. `infra/build.ps1` or `infra/build.sh` installs pinned arm64 wheels (`infra/lambda-requirements.txt`), copies `server bank agent policy ui/dist`, and `infra/build_zip.py` writes `build/interlock-lambda.zip` with `run.sh` set to mode 755 and LF line endings (zips made on Windows lose both otherwise).

Measured on this machine: **31.0 MB zipped, 66.5 MB unzipped** (dependencies 82 MB including `.pyc` files, which the zip leaves out; the UI used for the measurement was 0.4 MB, copied from the main folder's `ui/dist`). Limits read from the account: 262,144,000 bytes unzipped, 52,428,800 zipped. The zip can go straight to `update-function-code`, so no S3 bucket is needed.

## 2. Assumptions and how each was checked

| # | Assumption | Source | Verified |
| :-- | :-- | :-- | :-- |
| 1 | Web Adapter runs a Python FastAPI app from a zip with a layer, handler `run.sh`, env `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap` | https://aws.github.io/aws-lambda-web-adapter/getting-started/zip-packages.html and the repo example https://github.com/awslabs/aws-lambda-web-adapter/tree/main/examples/fastapi-response-streaming-zip | Read in docs. Not run on Lambda. |
| 2 | Response streaming needs `AWS_LWA_INVOKE_MODE=response_stream` plus Function URL `InvokeMode: RESPONSE_STREAM` | same example template (`template.yaml`) and the adapter README | Read in docs. Not run on Lambda. |
| 3 | arm64 layer ARN `arn:aws:lambda:<region>:753240598075:layer:LambdaAdapterLayerArm64:30`, version 30 | https://github.com/awslabs/aws-lambda-web-adapter (README, "Lambda Layer") | Read in docs. **Not checked that version 30 exists in ap-south-1** (a read-only `lambda get-layer-version-by-arn` call could confirm; not run). It is a template parameter. |
| 4 | Windows-built zips need LF and mode 755 for the startup script | zip-packages page above | Done in `infra/build_zip.py`; checked the mode in the produced zip (0o100755). |
| 5 | Adapter forwards request context in `x-amzn-request-context`; Function URL events carry `requestContext.http.sourceIp` | https://aws.github.io/aws-lambda-web-adapter/features/request-context.html (header and `requestContext.http.sourceIp` appear in the page) | **Partly.** The header name and field were read in docs; that a client cannot forge the header through a Function URL was not tested. Tested locally with a simulated header only. |
| 6 | Runtime `python3.12` is supported, deprecation Oct 31 2028 | https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html | Read. Matches the Python 3.12.10 the tests run on. |
| 7 | Account concurrency quota is 10; reserved concurrency can only use (unreserved minus 100) | https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html; `aws lambda get-account-settings` and `aws service-quotas get-service-quota --quota-code L-B99A9384` returned 10 | **Verified. Reserved concurrency is impossible on this account** (10 minus 100 is negative). The account quota of 10 is itself the cap on parallel executions. The template has a `ReservedConcurrency` parameter (0 = not set). |
| 8 | Function URL with auth NONE needs two resource-policy statements (`InvokeFunctionUrl` and `InvokeFunction` with `InvokedViaFunctionUrl`) | https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html | Read; the template has both; `cfn-lint` and `validate-template` accept it. |
| 9 | Global inference profile needs three IAM statements (profile in region, model in region, model with region `unspecified`) | https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html | Read; template follows it. Not exercised (no Bedrock calls allowed). |
| 10 | DynamoDB always-free is 25 GB storage plus 25 provisioned RCU and 25 provisioned WCU; **on-demand requests get no free allowance** | https://aws.amazon.com/dynamodb/pricing/on-demand/ (free-tier wording in the provisioned example); search results from repost.aws and builder.aws.com agree | Read. This changed the design: the table is **provisioned at 20/20**, not on-demand (the brief assumed on-demand). Excess requests are throttled, which also bounds abuse. |
| 11 | Lambda always-free: 1,000,000 requests and 400,000 GB-seconds per month | the account's own free-tier usage API (read by the conductor today) | Verified by the conductor. |
| 12 | CloudWatch Logs, AWS Budgets and data-transfer free allowances | https://aws.amazon.com/cloudwatch/pricing/, https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/, https://aws.amazon.com/ec2/pricing/on-demand/ (data transfer) | **Not read.** The plan assumes small volumes and says "see pricing page". |
| 13 | Template validity | `aws cloudformation validate-template` (read-only) and `cfn-lint` 0 findings | Verified, both run today. |
| 14 | Function code upload without S3: create the function with a placeholder, then `aws lambda update-function-code --zip-file fileb://...` (50 MB direct limit) | https://docs.aws.amazon.com/lambda/latest/api/API_UpdateFunctionCode.html and the limits read from the account | Limits verified; the flow itself not run. A later stack update does not overwrite code while the template's placeholder text is unchanged (CloudFormation only updates changed properties). |
| 15 | Bedrock model `global.amazon.nova-2-lite-v1:0` works in ap-south-1 | conductor's live check | Reported by the conductor, not re-run. |

## 3. Monthly cost estimate

No prices are quoted: I did not read a price I could cite. "Allowance" is the always-free amount (the account has no free-tier credits left). Request sizes are my estimates (about 0.3 s per request at 0.5 GB, so 0.15 GB-s each; each request makes a few DynamoDB calls).

| Service | Quiet: 2,000 requests/month | Busy: 50,000 requests/month | Abuse attempt (bounded) |
| :-- | :-- | :-- | :-- |
| Lambda requests | 2,000 of 1,000,000 free | 50,000 of 1,000,000 free | Rate limits (30 per minute per caller IP per endpoint) cap one address at about 130,000 per day per endpoint, so a few addresses can pass 1,000,000 a month. The only hard bound is concurrency 10. |
| Lambda compute | about 300 GB-s of 400,000 free | about 7,500 GB-s of 400,000 free | Ceiling with all 10 slots busy all month: 10 x 0.5 GB x 2,592,000 s = 12.96 million GB-s. The 400,000 free GB-s are used up after about 22 hours of full saturation. Beyond that the overage is billed at the Lambda rate (see pricing page): ceiling = (12.96M - 0.4M) GB-s x that rate. The Budget alert fires first. |
| Function URL | no separate charge expected (see pricing page) | same | same |
| DynamoDB capacity | 20 RCU / 20 WCU provisioned, inside the free 25 / 25 | same | same. Fixed by configuration; extra requests are throttled, not billed. |
| DynamoDB storage | a few KB of 25 GB free | under 100 MB of 25 GB free | sessions cap out as items expire after 24 h; far under 25 GB |
| CloudWatch Logs | tiny; 7-day retention (free allowance: see pricing page) | small | Log volume grows with requests; the only service whose abuse cost is not hard-bounded. `--log-level warning` keeps it low. |
| Data transfer out | UI is 0.4 MB (the final UI may differ) so about 1 GB | about 20 GB | Bounded by concurrency 10 and per-request size. See pricing page for the free monthly amount. |
| Bedrock | **0** (mode off, no permission attached) | **0** | **0** in off mode. In bedrock mode: at most `DailyModelCap` calls per day (default 200) x about 300 output tokens each; price per token: see pricing page. |
| AWS Budgets | one budget; see pricing page for the free count | same | same |

Items that can cost money: Bedrock (only in bedrock mode, capped per day), Lambda compute under sustained abuse, CloudWatch Logs under sustained abuse, data transfer under sustained abuse. DynamoDB stays inside the free 25/25 units by design.

## 4. Controls

- Mode `off` is the template default; the Bedrock IAM policy exists only when `Mode=bedrock`.
- Daily model cap: DynamoDB conditional counter per UTC day, default 200, parameter `DailyModelCap`. Tested (`tests/test_store.py`: atomic under 20 threads, cap stops calls, clear message).
- Concurrency: the account quota is 10 and cannot be reduced by reservation on this account (assumption 7).
- Per-caller rate limits, MFA lockout (5 wrong codes per session, 20 per client), now shared for the per-session part across instances.
- Budget: monthly USD limit (parameter, default 5), emails at 50% actual, 100% actual and 100% forecast to `BudgetEmail`. A budget only alerts; it does not stop spending. Kill switch: section 6.
- Logs: 7 days. Session items expire after 24 h.

## 5. Deploy commands (conductor, after the owner approves)

Needs: AWS CLI signed in to the account, Python 3.12+, Node. Run from the repo root on the `deploy-prep` branch. The two values in angle brackets come from the owner and must not be committed.

```powershell
# 1. Build the zip (builds the UI if ui/dist is missing; use -RebuildUi after UI changes)
.\infra\build.ps1            # Linux/macOS: ./infra/build.sh
# expect: build/interlock-lambda.zip, about 31 MB zipped

# 2. Create the stack (function with a placeholder, table, role, log group, URL, budget)
aws cloudformation deploy --region ap-south-1 --stack-name interlock `
  --template-file infra/template.yaml --capabilities CAPABILITY_IAM `
  --parameter-overrides BudgetEmail=<owner-email> DemoMfaCode=<6-digit-code> Mode=off `
  AdapterLayerArn=arn:aws:lambda:ap-south-1:753240598075:layer:LambdaAdapterLayerArm64:30

# 3. Upload the real code (no S3 bucket needed)
aws lambda update-function-code --region ap-south-1 --function-name interlock-app `
  --zip-file fileb://build/interlock-lambda.zip --architectures arm64
aws lambda wait function-updated --region ap-south-1 --function-name interlock-app

# 4. Read the public URL and smoke-test it
$url = aws cloudformation describe-stacks --region ap-south-1 --stack-name interlock `
  --query "Stacks[0].Outputs[?OutputKey=='AppUrl'].OutputValue" --output text
curl.exe -s -o NUL -w "%{http_code}\n" "$($url)policy"                 # 200
curl.exe -s -X POST "$($url)session"                                   # {"session_id": ...}
```

The CloudFormation role used for step 2 needs permission to create Lambda, IAM role, DynamoDB, Logs and Budgets resources (`budgets:*` is the one often missing). The first request after idle takes longer (cold start).

To turn real-model chat on later (optional, costs Bedrock tokens): re-run step 2 with `Mode=bedrock DailyModelCap=<n>`. Model access for the Nova model was reported working by the conductor.

Updating the app later: rebuild, then repeat step 3 only.

## 6. Rollback, kill switch, teardown

```powershell
# Roll back code: rebuild the previous commit's zip (git checkout <commit>; .\infra\build.ps1) and repeat step 3.

# Kill switch (stops all public traffic at once, keeps data): remove the public URL
aws lambda delete-function-url-config --region ap-south-1 --function-name interlock-app
# Bring it back: re-run step 2 (CloudFormation recreates the URL) 

# Teardown (deletes the function, table, logs, budget; the URL stops working)
aws cloudformation delete-stack --region ap-south-1 --stack-name interlock
aws cloudformation wait stack-delete-complete --region ap-south-1 --stack-name interlock
```

Deleting a function URL with auth NONE leaves its resource policy behind per the Lambda docs; the stack delete removes the function and policy together. The kill switch via `delete-function-url-config` was not run; CloudFormation drift is expected after it.

## 7. Uptime check plan

Free option: a GitHub Actions workflow on a schedule (every 15 minutes, `curl --fail --max-time 20 "$URL/policy"`), with the URL stored as a repository variable and failure notifications going to the repo owner by GitHub's own email. Cost: free for public repositories under the current GitHub terms (not verified; check GitHub's pricing page). It adds about 2,900 Lambda requests a month (4 per hour x 24 x 30), which the Lambda allowance covers, and keeps one instance warm from time to time. It is not committed yet because the URL does not exist. Alternative inside AWS (EventBridge Scheduler or a CloudWatch Synthetics canary): not chosen, more resources to create and price to check.

## 8. Risks

- The MFA code is a stack parameter. It is stored in the function's environment, readable by anyone with `lambda:GetFunctionConfiguration` in the account. How a judge gets the code (the human approval step) is a product decision for the owner: the UI helper's "you are the agent" flow must show it or avoid needing it.
- Per-client rate limits and per-client MFA counters live in each instance's memory. With concurrency up to 10, an attacker's budget is up to 10 times the per-instance limit, until the instance recycles. The per-session MFA lockout is shared, which is the one that matters for brute force of one session.
- Chat history of the model agent is not shared between instances (only gate state is); a turn on a cold instance starts with an empty conversation. Irrelevant in mode off.
- Header forgery: if a Function URL passed a client-supplied `x-amzn-request-context` through, a client could pick its own rate-limit key. Not tested on Lambda (assumption 5). Check after deploy by sending a fake header and confirming the limit still applies to the real address.
- The 10-concurrent-execution account quota means a flood gives other visitors throttling errors (HTTP 429/503 from Lambda). That is the cost bound working.
- Provisioned DynamoDB throttles above about 20 requests per second; the app then returns 500 for those calls.
- The layer version 30 may not exist in ap-south-1; the deploy would fail at step 2 without side effects other than a rolled-back stack.
- `ui/dist` is built by someone else's work; the zip includes whatever `ui/dist` holds at build time.
- The adapter's readiness check hits `/policy` at cold start.

## 9. Local proof

- `pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py`: 359 passed (before this branch: 329 reported in HARDENING_REPORT, plus the other branches' tests; 28 are new in `tests/test_store.py`).
- `tests/test_store.py` runs the store contract against both the in-memory store and a DynamoDB table faked by moto 5.2.5 (installed into the main venv for this work; `infra/requirements-dev.txt` lists it; the DynamoDB cases skip if moto is missing). Covers exact round trip, create/stale-write conflicts, 8 concurrent writers (exactly one wins), lease exclusion, TTL expiry, 20 concurrent counter increments (exactly 5 of limit 5 succeed), gate snapshot round trip, state following a session across separate app instances, MFA lockout counted across 3 instances, 4 simultaneous MFA requests (one MFA effect), cap behaviour, mode off, client address header.
- `python infra/local_proof.py`: starts the real app under uvicorn in production mode with the DynamoDB store (moto) and the Function-URL header, and checks readiness, off-mode chat refusal, session lockout after 5 wrong codes, per-IP rate limiting, and that sessions are table items. All 7 checks pass. This simulates the adapter's expectations (local port, readiness path, header); it does not run the adapter binary.

## 10. Not verified

- Anything on real Lambda: the layer in ap-south-1, streaming through the adapter, cold-start time, the header's trustworthiness, `update-function-code` flow, Budgets creation.
- The AWS Budgets, CloudWatch Logs, Function URL and data-transfer free allowances and prices (not read).
- Real Bedrock calls through the cap (the cap was tested with the scripted stub model only).
- The built UI in the zip is an older copy from the main folder; a fresh `npm ci && npm run build` was not run here (memory was tight).
- The uptime workflow and the `delete-function-url-config` kill switch were not run.
- Python 3.12 arm64 wheels were fetched and the zip built on Windows; the app was not imported under Linux arm64.
- Tests were run once on the whole fast set; the slow suites (mutation, replay) were not run.

## 11. Commits (`git log --oneline origin/sync-main..deploy-prep`, this plan is one more)

```
b5ee811 Use provisioned table inside free tier
87341f3 Fix local proof script syntax
01a07ea Add local proof script and LF rules
444814d Add Lambda zip build scripts
a6e549e Add CloudFormation template and pinned deps
c15d89e Test store, cap, cross-instance state
c2b5383 Wire store, cap, client IP into app
3650e11 Add shared-state registry and lockout sync
3b13b83 Add model mode and daily call cap
2ee7102 Add memory and DynamoDB session store
```
