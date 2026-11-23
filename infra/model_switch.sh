#!/bin/bash
# Kill switch for real-model use on the deployed function: sets only INTERLOCK_MODEL, keeps every other variable.
#   infra/model_switch.sh off            # no Bedrock call is possible within seconds of the update
#   infra/model_switch.sh on             # back to bedrock (still needs the judge code and the caps)
#   infra/model_switch.sh off --dry-run  # show what would change, write nothing
# aws lambda update-function-configuration replaces the WHOLE environment, so this reads the current one first.
# Variable values (the codes) are never printed. Needs the aws CLI and jq.
# Test hooks: ENV_FILE=<json> reads the environment from a file instead of AWS; OUT_FILE=<path> writes the new one there.
set -euo pipefail
case "${1:-}" in on) new=bedrock ;; off) new=off ;; *) echo "usage: $0 on|off [--dry-run]" >&2; exit 2 ;; esac
fn="${FUNCTION:-interlock-app}"; region="${REGION:-ap-south-1}"
if [ -n "${ENV_FILE:-}" ]; then cur=$(cat "$ENV_FILE")
else cur=$(aws lambda get-function-configuration --function-name "$fn" --region "$region" --query Environment.Variables --output json); fi
[ "$(echo "$cur" | jq 'length // 0')" -gt 0 ] || { echo "the function has no environment variables; refusing to write one" >&2; exit 1; }
old=$(echo "$cur" | jq -r '.INTERLOCK_MODEL // "unset"')
body=$(echo "$cur" | jq -c --arg m "$new" '{Variables: (. + {INTERLOCK_MODEL: $m})}')
echo "INTERLOCK_MODEL: $old -> $new; $(echo "$cur" | jq 'del(.INTERLOCK_MODEL) | length') other variables kept: $(echo "$cur" | jq -r 'del(.INTERLOCK_MODEL) | keys | join(", ")')"
[ -z "${OUT_FILE:-}" ] || printf '%s' "$body" > "$OUT_FILE"
if [ "${2:-}" = "--dry-run" ]; then echo "dry run: nothing was written"; exit 0; fi
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
printf '%s' "$body" > "$tmp"
aws lambda update-function-configuration --function-name "$fn" --region "$region" --environment "file://$tmp" --query Environment.Variables.INTERLOCK_MODEL --output text
