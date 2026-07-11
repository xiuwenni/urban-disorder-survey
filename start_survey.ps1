$ErrorActionPreference = "Stop"

$node = "C:\Users\Xiuwen Ni\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path -LiteralPath $node)) {
  $node = "node"
}

& $node "$PSScriptRoot\server.mjs"
