"""Manual smoke test: real model (BEDROCK_MODEL_ID / AWS_REGION, default Nova 2 Lite, ap-south-1)
through the real HTTP API on 127.0.0.1. ONE chat message (about 2 Bedrock calls). Run:
  .venv\\Scripts\\python scripts\\smoke_api.py
Model calls are appended to scripts/bedrock_calls.log (label 'smoke_api')."""
import os
import sys
import threading
import time

import httpx
import uvicorn

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from agent.bedrock import count_model_calls  # noqa: E402
from server.app import create_app  # noqa: E402

PORT = 8765
app = create_app()
server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning"))
threading.Thread(target=server.run, daemon=True).start()
base = f"http://127.0.0.1:{PORT}"
for _ in range(50):
    try:
        httpx.get(base + "/docs", timeout=1)
        break
    except Exception:
        time.sleep(0.2)

sid = httpx.post(base + "/session").json()["session_id"]
count_model_calls(app.state.registry.get(sid).agent, "smoke_api")
with httpx.stream("POST", f"{base}/session/{sid}/chat", json={"message": "Please log me in."}, timeout=120) as r:
    print("HTTP", r.status_code)
    print(r.read().decode())
print("STATE", httpx.get(f"{base}/session/{sid}/state").json())
server.should_exit = True
