# Create a scheduled task to set up firewall rules as SYSTEM (no UAC needed)
$taskName = "HermesFirewallSetup"
$scriptPath = "C:\Users\Zaim-Work\Projects\command-center\setup-firewall.ps1"

# Create the action (run the firewall script)
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`""

# Run as SYSTEM with highest privileges — no user account, no UAC prompt
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Trigger: run once, 10 seconds from now
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddSeconds(10))

# Settings: allow task to run on demand, don't stop if running too long
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Register the task
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Force

Write-Output "Task '$taskName' registered. It will run in ~10 seconds as SYSTEM."

# Wait and check result
Start-Sleep -Seconds 12
$result = Get-ScheduledTask -TaskName $taskName | Get-ScheduledTaskInfo
if ($result.LastTaskResult -eq 0) {
    Write-Output "Firewall rules applied successfully."
    # Clean up: remove the task
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Output "Task removed."
} else {
    Write-Output "Task result code: $($result.LastTaskResult)"
}
