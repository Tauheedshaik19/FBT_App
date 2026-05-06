$nodePath = Join-Path $PSScriptRoot '.tools\nodejs'

if (-not (Test-Path (Join-Path $nodePath 'node.exe'))) {
    Write-Error "Local Node.js install not found at $nodePath"
    exit 1
}

$env:Path = "$nodePath;$env:Path"
Write-Host "Node.js enabled for this session:"
& (Join-Path $nodePath 'node.exe') -v
& (Join-Path $nodePath 'npm.cmd') -v
