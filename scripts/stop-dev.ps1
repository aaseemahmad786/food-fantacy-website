$ports = @(4000, 5173)

foreach ($port in $ports) {
  $connections = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue

  foreach ($connection in $connections) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue

    if ($process -and $process.Name -eq "node.exe") {
      Write-Host "Stopping Node process $($process.ProcessId) on port $port"
      Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}
