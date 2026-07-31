#!/usr/bin/env pwsh
# vw-gui :: registry reader
# Executes vw-commands.ps1 and emits the command registry as JSON on stdout.
# Executing (rather than text-parsing) keeps the GUI in lockstep with what
# vw.ps1 itself sees, including $PSScriptRoot resolution.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RegistryPath
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not (Test-Path $RegistryPath)) {
    throw "Command registry not found at: $RegistryPath"
}

$Commands = & $RegistryPath

$out = [System.Collections.Generic.List[object]]::new()

foreach ($key in $Commands.Keys) {
    $c = $Commands[$key]

    $params = [System.Collections.Generic.List[object]]::new()
    if ($c.Parameters) {
        foreach ($p in $c.Parameters) {
            # Defaults are authored as literals ("15", "$true", "(current dir)");
            # normalise to a display string, never evaluate them.
            $default = $null
            if ($null -ne $p.Default) { $default = "$($p.Default)" }

            $params.Add([ordered]@{
                Name        = $p.Name
                Type        = if ($p.Type) { "$($p.Type)" } else { "string" }
                Mandatory   = [bool]$p.Mandatory
                Default     = $default
                ValidSet    = @($p.ValidSet | Where-Object { $null -ne $_ })
                Aliases     = @($p.Aliases | Where-Object { $null -ne $_ })
                Description = $p.Description
            })
        }
    }

    $scriptPath = "$($c.ScriptPath)"

    $out.Add([ordered]@{
        Name        = $key
        ScriptPath  = $scriptPath
        Description = $c.Description
        Category    = if ($c.Category) { "$($c.Category)" } else { "Uncategorized" }
        Destructive = [bool]$c.Destructive
        Parameters  = $params.ToArray()
        Examples    = @($c.Examples | Where-Object { $null -ne $_ })
        Exists      = [bool](Test-Path -LiteralPath $scriptPath)
    })
}

ConvertTo-Json -InputObject @($out.ToArray()) -Depth 8 -Compress
