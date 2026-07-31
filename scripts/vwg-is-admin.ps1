#!/usr/bin/env pwsh
# vw-gui :: administrator probe
# Mirrors the privilege half of vw.ps1's destructive-command gate.

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
