"""Local proof of the Lambda setup, no AWS: the real app (production mode, DynamoDB store on moto's
in-process fake, Function-URL client-IP header) served by uvicorn on the Web Adapter's port, hit over HTTP.
Run: python infra/local_proof.py  (needs moto, see infra/requirements-dev.txt)"""
import json
import os
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.update(AWS_ACCESS_KEY_ID="x", AWS_SECRET_ACCESS_KEY="x", AWS_DEFAULT_REGION="ap-south-1",
                  INTERLOCK_ENV="production", DEMO_MFA_CODE="246810", INTERLOCK_STORE="dynamodb",
                  INTERLOCK_TABLE="t", INTERLOCK_TRUST_PROXY="lambda", INTERLOCK_MODEL="off")
import boto3, httpx, moto, uvicorn  # noqa: E402

with moto.mock_aws():
    boto3.client("dynamodb").create_table(
        TableName="t", KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}], BillingMode="PAY_PER_REQUEST")
    from server.app import app
    port = int(os.environ.get("PORT", "8000"))
    srv = uvicorn.Server(uvicorn.Config(app, port=port, log_level="warning"))
    threading.Thread(target=srv.run, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            httpx.get(base + "/policy"); break
        except Exception:
            time.sleep(0.2)
    ctx = lambda ip: {"x-amzn-request-context": json.dumps({"http": {"sourceIp": ip}})}
    ok = lambda name, cond: print(("PASS " if cond else "FAIL ") + name) or cond
    r = []
    r.append(ok("readiness /policy 200", httpx.get(base + "/policy").status_code == 200))
    sid = httpx.post(base + "/session", headers=ctx("203.0.113.1")).json()["session_id"]
    r.append(ok("state stored in DynamoDB", httpx.get(f"{base}/session/{sid}/state").json()["state"] is not None)
    r.append(ok("chat refused in off mode", httpx.post(f"{base}/session/{sid}/chat", json={"message": "x"}).status_code == 403))
    for i in range(5):
        httpx.post(f"{base}/session/{sid}/mfa", json={"code": "000000"}, headers=ctx("203.0.113.2"))
    r.append(ok("session locked after 5 wrong codes", httpx.post(f"{base}/session/{sid}/mfa", json={"code": "246810"},
                                                              headers=ctx("203.0.113.3")).status_code == 429))
    n = [httpx.post(base + "/session", headers=ctx("198.51.100.7")).status_code for _ in range(32)]
    r.append(ok("rate limit is per caller IP (32nd call 429)", n[-1] == 429 and n[0] == 200))
    r.append(ok("other caller IP unaffected", httpx.post(base + "/session", headers=ctx("198.51.100.8")).status_code == 200))
    items = boto3.client("dynamodb").scan(TableName="t")["Count"]
    r.append(ok("sessions are items in the table", items >= 1))
    srv.should_exit = True
    sys.exit(0 if all(r) else 1)
