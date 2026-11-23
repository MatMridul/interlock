# Kill switch for real-model use on the deployed function: sets only INTERLOCK_MODEL, keeps every other variable.
#   .\infra\model_switch.ps1 off            # no Bedrock call is possible within seconds of the update
#   .\infra\model_switch.ps1 on             # back to bedrock (still needs the judge code and the caps)
#   .\infra\model_switch.ps1 off -DryRun    # show what would change, write nothing
# aws lambda update-function-configuration replaces the WHOLE environment, so this reads the current one first.
# Variable values (the codes) are never printed. -EnvFile / -OutFile exist for tests: read the environment from a
# JSON file instead of AWS, and write the new environment to a file instead of sending it.
param(
  [Parameter(Mandatory = $true, Position = 0)][ValidateSet("on", "off")][string]$Model,
  [string]$Function = "interlock-app",
  [string]$Region = "ap-south-1",
  [string]$EnvFile,
  [string]$OutFile,
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$new = if ($Model -eq "on") { "bedrock" } else { "off" }
if ($EnvFile) { $json = Get-Content $EnvFile -Raw }
else { $json = aws lambda get-function-configuration --function-name $Function --region $Region --query Environment.Variables --output json; if ($LASTEXITCODE) { throw "cannot read the function configuration" } }
$vars = $json | ConvertFrom-Json -AsHashtable
if (-not $vars -or $vars.Count -eq 0) { throw "the function has no environment variables; refusing to write one" }
$old = $vars["INTERLOCK_MODEL"]
$vars["INTERLOCK_MODEL"] = $new
Write-Host "INTERLOCK_MODEL: $old -> $new; $($vars.Count - 1) other variables kept: $((($vars.Keys | Where-Object { $_ -ne 'INTERLOCK_MODEL' } | Sort-Object) -join ', '))"
$body = @{ Variables = $vars } | ConvertTo-Json -Compress
if ($OutFile) { Set-Content -Path $OutFile -Value $body -NoNewline }
if ($DryRun) { Write-Host "dry run: nothing was written"; return }
$tmp = New-TemporaryFile
try {
  Set-Content -Path $tmp -Value $body -NoNewline
  aws lambda update-function-configuration --function-name $Function --region $Region --environment "file://$($tmp.FullName)" --query "Environment.Variables.INTERLOCK_MODEL" --output text
  if ($LASTEXITCODE) { throw "update failed" }
} finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
