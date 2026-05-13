$CapRover = $false
if ($args -contains "-CapRover") {
  $CapRover = $true
}

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot
if ($CapRover) {
  npm run deploy:caprover
} else {
  npm run deploy:image
}
