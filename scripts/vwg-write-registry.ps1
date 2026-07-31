#!/usr/bin/env pwsh
# vw-gui :: registry writer
#
# Surgically inserts / updates / removes a single entry in vw-commands.ps1.
# The file is hand-maintained -- ordered hashtable, category comment headers,
# aligned '=', mixed tab and space indentation, a regex hint in the header --
# so everything outside the touched block stays byte-identical. A timestamped
# backup is written before any modification.
#
# Entry payload arrives base64-encoded JSON to avoid shell quoting entirely.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("insert", "update", "delete")]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [string]$RegistryPath,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    # Base64 UTF-8 JSON of the entry. Not required for delete.
    [string]$EntryB64 = "",

    # Rename support: when updating, the key may change.
    [string]$NewName = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not (Test-Path -LiteralPath $RegistryPath)) {
    throw "Command registry not found at: $RegistryPath"
}

$KeyColumnWidth = 29   # width of the quoted key before ' = @{'
$FieldWidth = 11       # width of inner field names before ' = '

# --- helpers ---------------------------------------------------------------

function Escape-PsString {
    param([string]$Value)
    if ($null -eq $Value) { return "" }
    # Double-quoted PowerShell string: backtick, quote and dollar need escaping.
    return $Value -replace '`', '``' -replace '"', '`"' -replace '\$', '`$'
}

function Strip-Strings {
    param([string]$Line)
    # Remove quoted content so braces inside descriptions do not skew the
    # brace counter used for block detection.
    $s = $Line -replace '"(?:`.|[^"`])*"', '""'
    $s = $s -replace "'(?:[^']|'')*'", "''"
    if ($s -match '^\s*#') { return "" }
    return $s
}

function Find-EntryBlock {
    param([string[]]$Lines, [string]$Key)
    $escaped = [regex]::Escape($Key)
    $start = -1
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match "^\s*[`"']$escaped[`"']\s*=\s*@\{") { $start = $i; break }
    }
    if ($start -lt 0) { return $null }

    $depth = 0
    for ($i = $start; $i -lt $Lines.Count; $i++) {
        $clean = Strip-Strings $Lines[$i]
        $depth += ([regex]::Matches($clean, '\{')).Count
        $depth -= ([regex]::Matches($clean, '\}')).Count
        if ($depth -le 0 -and $i -ge $start) {
            return @{ Start = $start; End = $i }
        }
    }
    return $null
}

function Get-EntryCategory {
    param([string[]]$Lines, [int]$Start, [int]$End)
    for ($i = $Start; $i -le $End; $i++) {
        if ($Lines[$i] -match '^\s*Category\s*=\s*"([^"]*)"') { return $Matches[1] }
    }
    return ""
}

function Get-AllEntries {
    param([string[]]$Lines)
    $entries = [System.Collections.Generic.List[object]]::new()
    $i = 0
    while ($i -lt $Lines.Count) {
        if ($Lines[$i] -match '^\s*["'']([^"'']+)["'']\s*=\s*@\{') {
            $key = $Matches[1]
            $block = Find-EntryBlock -Lines $Lines -Key $key
            if ($block) {
                $entries.Add([pscustomobject]@{
                    Key      = $key
                    Start    = $block.Start
                    End      = $block.End
                    Category = Get-EntryCategory -Lines $Lines -Start $block.Start -End $block.End
                })
                $i = $block.End + 1
                continue
            }
        }
        $i++
    }
    return $entries
}

function Build-EntryBlock {
    param($Entry, [string]$Indent)

    $inner = $Indent + $Indent.Substring(0, [Math]::Min(4, $Indent.Length))
    if ($Indent -match "^`t") { $inner = $Indent + "`t" } else { $inner = $Indent + "    " }
    $deep = if ($Indent -match "^`t") { $inner + "`t" } else { $inner + "    " }

    $keyText = '"' + $Entry.Name + '"'
    if ($keyText.Length -lt $KeyColumnWidth) { $keyText = $keyText.PadRight($KeyColumnWidth) }

    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine("$Indent$keyText = @{")

    $scriptFile = [System.IO.Path]::GetFileName("$($Entry.ScriptPath)")
    # $PSScriptRoot stays a literal so the registry keeps resolving relatively.
    [void]$sb.AppendLine("$inner$("ScriptPath".PadRight($FieldWidth)) = `"`$PSScriptRoot\$scriptFile`"")
    [void]$sb.AppendLine("$inner$("Description".PadRight($FieldWidth)) = `"$(Escape-PsString $Entry.Description)`"")
    [void]$sb.AppendLine("$inner$("Category".PadRight($FieldWidth)) = `"$(Escape-PsString $Entry.Category)`"")

    if ($Entry.Destructive) {
        [void]$sb.AppendLine("$inner$("Destructive".PadRight($FieldWidth)) = `$true")
    }

    if ($Entry.Parameters -and @($Entry.Parameters).Count -gt 0) {
        [void]$sb.AppendLine("$inner$("Parameters".PadRight($FieldWidth)) = @(")
        foreach ($p in $Entry.Parameters) {
            $parts = [System.Collections.Generic.List[string]]::new()
            $parts.Add("Name = `"$(Escape-PsString $p.Name)`"")
            $parts.Add("Type = `"$(Escape-PsString $p.Type)`"")
            $mand = if ($p.Mandatory) { '$true' } else { '$false' }
            $parts.Add("Mandatory = $mand")
            if ($p.Aliases -and @($p.Aliases).Count -gt 0) {
                $al = (@($p.Aliases) | ForEach-Object { "`"$(Escape-PsString $_)`"" }) -join ", "
                $parts.Add("Aliases = @($al)")
            }
            if ($null -ne $p.Default -and "$($p.Default)" -ne "") {
                $parts.Add("Default = `"$(Escape-PsString $p.Default)`"")
            }
            if ($p.ValidSet -and @($p.ValidSet).Count -gt 0) {
                $vs = (@($p.ValidSet) | ForEach-Object { "`"$(Escape-PsString $_)`"" }) -join ", "
                $parts.Add("ValidSet = @($vs)")
            }
            if ($p.Description) {
                $parts.Add("Description = `"$(Escape-PsString $p.Description)`"")
            }
            [void]$sb.AppendLine("$deep@{ $($parts -join '; ') }")
        }
        [void]$sb.AppendLine("$inner)")
    }

    if ($Entry.Examples -and @($Entry.Examples).Count -gt 0) {
        $ex = (@($Entry.Examples) | ForEach-Object { "`"$(Escape-PsString $_)`"" }) -join ", "
        [void]$sb.AppendLine("$inner$("Examples".PadRight($FieldWidth)) = @($ex)")
    }

    [void]$sb.AppendLine("$Indent}")
    return $sb.ToString().TrimEnd("`r", "`n") -split "`r?`n"
}

# --- load ------------------------------------------------------------------

$raw = Get-Content -LiteralPath $RegistryPath -Raw -Encoding UTF8
$newline = if ($raw -match "`r`n") { "`r`n" } else { "`n" }
$lines = [System.Collections.Generic.List[string]]::new()
$lines.AddRange([string[]]($raw -split "`r?`n"))

$entries = Get-AllEntries -Lines $lines.ToArray()
$existing = $entries | Where-Object { $_.Key -eq $Name } | Select-Object -First 1

# Most entries are indented 4 spaces; a few use a tab. Follow the file.
$defaultIndent = "    "
if ($entries.Count -gt 0) {
    $sample = $lines[$entries[0].Start]
    if ($sample -match '^(\s+)') { $defaultIndent = $Matches[1] }
}

$entry = $null
if ($EntryB64) {
    $json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($EntryB64))
    $entry = $json | ConvertFrom-Json
}

# --- backup ----------------------------------------------------------------

$backupDir = Join-Path (Split-Path -Parent $RegistryPath) ".vwg-backups"
if (-not (Test-Path -LiteralPath $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupDir "vw-commands.$stamp.bak.ps1"
Copy-Item -LiteralPath $RegistryPath -Destination $backupPath -Force

# --- apply -----------------------------------------------------------------

switch ($Action) {
    "delete" {
        if (-not $existing) { throw "Command '$Name' not found in registry." }
        $block = Find-EntryBlock -Lines $lines.ToArray() -Key $Name
        $lines.RemoveRange($block.Start, $block.End - $block.Start + 1)
    }

    "update" {
        if (-not $existing) { throw "Command '$Name' not found in registry." }
        if ($NewName) { $entry.Name = $NewName }
        $block = Find-EntryBlock -Lines $lines.ToArray() -Key $Name
        $indent = "    "
        if ($lines[$block.Start] -match '^(\s+)') { $indent = $Matches[1] }
        $newBlock = Build-EntryBlock -Entry $entry -Indent $indent
        $lines.RemoveRange($block.Start, $block.End - $block.Start + 1)
        $lines.InsertRange($block.Start, [string[]]$newBlock)
    }

    "insert" {
        if ($existing) { throw "Command '$Name' already exists in the registry." }

        $sameCat = $entries | Where-Object { $_.Category -eq $entry.Category }
        $newBlock = Build-EntryBlock -Entry $entry -Indent $defaultIndent

        if ($sameCat -and @($sameCat).Count -gt 0) {
            # Slot in after the last entry already carrying this category.
            $last = @($sameCat)[-1]
            $lines.InsertRange($last.End + 1, [string[]]$newBlock)
        }
        else {
            # New category: append before the closing brace of the hashtable,
            # preceded by a comment header matching the file's convention.
            $closeIdx = -1
            for ($i = $lines.Count - 1; $i -ge 0; $i--) {
                if ($lines[$i] -match '^\s*\}\s*$') { $closeIdx = $i; break }
            }
            if ($closeIdx -lt 0) { throw "Could not locate the closing brace of the command hashtable." }

            $header = [System.Collections.Generic.List[string]]::new()
            $header.Add("")
            $header.Add("$defaultIndent# $($entry.Category)")
            $lines.InsertRange($closeIdx, [string[]]$header.ToArray())
            $lines.InsertRange($closeIdx + $header.Count, [string[]]$newBlock)
        }
    }
}

# --- save ------------------------------------------------------------------

$output = ($lines -join $newline)
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($RegistryPath, $output, $utf8NoBom)

# Prove the result still parses and still returns a hashtable; roll back if not.
try {
    $check = & $RegistryPath
    if (-not $check -or $check.Count -eq 0) { throw "Registry returned no commands after write." }
    if ($Action -ne "delete") {
        $expected = if ($NewName) { $NewName } else { $entry.Name }
        if (-not $check.Contains($expected)) { throw "Entry '$expected' missing after write." }
    }
    elseif ($check.Contains($Name)) {
        throw "Entry '$Name' still present after delete."
    }
}
catch {
    Copy-Item -LiteralPath $backupPath -Destination $RegistryPath -Force
    throw "Registry write failed validation and was rolled back: $($_.Exception.Message)"
}

ConvertTo-Json -InputObject ([ordered]@{
    Ok      = $true
    Action  = $Action
    Name    = if ($NewName) { $NewName } else { $Name }
    Backup  = $backupPath
    Total   = $check.Count
}) -Compress
