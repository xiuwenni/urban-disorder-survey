$ErrorActionPreference = "Stop"

$node = "C:\Users\Xiuwen Ni\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path -LiteralPath $node)) {
  $node = "node"
}

$app = $PSScriptRoot
$data = Join-Path $app "data"
New-Item -ItemType Directory -Force -Path $data | Out-Null

$localListening = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if (-not $localListening) {
  Start-Process -FilePath $node -ArgumentList @((Join-Path $app "server.mjs")) -WorkingDirectory $app -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

$out = Join-Path $data "serveo.out.log"
$err = Join-Path $data "serveo.err.log"
if (Test-Path -LiteralPath $out) { Clear-Content -LiteralPath $out }
if (Test-Path -LiteralPath $err) { Clear-Content -LiteralPath $err }

Get-Process ssh -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Process -FilePath "C:\Windows\System32\OpenSSH\ssh.exe" `
  -ArgumentList @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-R", "80:127.0.0.1:8787", "serveo.net") `
  -WorkingDirectory $app `
  -WindowStyle Hidden `
  -RedirectStandardOutput $out `
  -RedirectStandardError $err

Start-Sleep -Seconds 12
Get-Content -LiteralPath $out -ErrorAction SilentlyContinue
Get-Content -LiteralPath $err -ErrorAction SilentlyContinue
