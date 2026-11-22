#!/bin/bash
exec python -m uvicorn --port=$PORT --log-level warning server.app:app
