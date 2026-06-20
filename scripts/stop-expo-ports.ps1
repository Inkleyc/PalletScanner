$ports = 8081..8090
$connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort }

if (-not $connections) {
  Write-Host "No Expo/Metro listeners found on ports 8081-8090."
  exit 0
}

$processIds = $connections |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) {
    continue
  }

  if ($process.ProcessName -notin @("node", "nodejs")) {
    Write-Host "Skipping PID $processId ($($process.ProcessName)); not a Node process."
    continue
  }

  Write-Host "Stopping Expo/Metro listener PID $processId ($($process.ProcessName))."
  Stop-Process -Id $processId -Force
}
