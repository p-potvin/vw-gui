#!/usr/bin/env pwsh
# vw-gui :: command runner
#
# Invokes a registry script with GUI-supplied parameters. Two problems this
# solves that a naive spawn does not:
#
#   1. Argument binding. Array splatting binds positionally in PowerShell, so
#      @('-Count','4') passes "-Count" as the first positional value. Hashtable
#      splatting binds by name and coerces types, so params arrive intact --
#      including spaces, ints, switches and string[].
#   2. Colour. Write-Host drops ANSI when stdout is redirected (which it always
#      is under Electron). The proxy below re-emits the colour itself, so the
#      GUI console shows what a real terminal would.
#
# Parameters arrive base64-encoded to sidestep every layer of shell quoting.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptPath,

    # Base64 of a UTF-8 JSON object: { "ParamName": value, ... }
    [string]$ArgsB64 = "",

    # When set, a completion sentinel is printed as the very last line so the
    # GUI can recover the exit code from a terminal stream. The sentinel is
    # emitted here rather than appended to the typed command line, so the
    # shell's own echo of that line can never be mistaken for completion.
    [string]$JobId = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($PSStyle) { $PSStyle.OutputRendering = "Ansi" }

# --- ANSI Write-Host proxy -------------------------------------------------
# Defined in this scope so scripts invoked with & inherit it.
$script:VwgFg = @{
    Black = 30; DarkRed = 31; DarkGreen = 32; DarkYellow = 33
    DarkBlue = 34; DarkMagenta = 35; DarkCyan = 36; Gray = 37
    DarkGray = 90; Red = 91; Green = 92; Yellow = 93
    Blue = 94; Magenta = 95; Cyan = 96; White = 97
}

function Write-Host {
    [CmdletBinding()]
    param(
        [Parameter(Position = 0, ValueFromPipeline = $true, ValueFromRemainingArguments = $true)]
        [System.Object[]]$Object,
        [switch]$NoNewline,
        [System.Object]$Separator = " ",
        [System.ConsoleColor]$ForegroundColor,
        [System.ConsoleColor]$BackgroundColor
    )
    process {
        $text = if ($null -eq $Object) { "" } else { ($Object | ForEach-Object { "$_" }) -join $Separator }
        $codes = @()
        if ($PSBoundParameters.ContainsKey("ForegroundColor")) { $codes += $script:VwgFg["$ForegroundColor"] }
        if ($PSBoundParameters.ContainsKey("BackgroundColor")) { $codes += ($script:VwgFg["$BackgroundColor"] + 10) }
        if ($codes.Count -gt 0) {
            $text = "$([char]27)[$($codes -join ';')m$text$([char]27)[0m"
        }
        if ($NoNewline) { [Console]::Out.Write($text) } else { [Console]::Out.WriteLine($text) }
    }
}

# --- Resolve arguments -----------------------------------------------------
$splat = @{}
if (-not [string]::IsNullOrWhiteSpace($ArgsB64)) {
    $json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($ArgsB64))
    $obj = $json | ConvertFrom-Json
    foreach ($prop in $obj.PSObject.Properties) {
        $value = $prop.Value
        if ($null -eq $value) { continue }
        if ($value -is [string] -and $value -eq "") { continue }
        # ConvertFrom-Json hands back Object[] for arrays; cast so string[] params bind.
        if ($value -is [System.Object[]]) { $value = [string[]]@($value | ForEach-Object { "$_" }) }
        $splat[$prop.Name] = $value
    }
}

function Complete-Run {
    param([int]$Code)
    if ($JobId) {
        [Console]::Out.WriteLine("<<VWG:EXIT:${JobId}:${Code}>>")
    }
    exit $Code
}

if (-not (Test-Path -LiteralPath $ScriptPath)) {
    Write-Host "Script file not found: $ScriptPath" -ForegroundColor Red
    Complete-Run 127
}

# --- Execute ---------------------------------------------------------------
Write-Host ">>> $([System.IO.Path]::GetFileName($ScriptPath))" -ForegroundColor Cyan
Write-Host ">>> Working directory: $($PWD.Path)" -ForegroundColor DarkGray
if ($splat.Count -gt 0) {
    $shown = ($splat.Keys | Sort-Object | ForEach-Object { "-$_ $($splat[$_])" }) -join " "
    Write-Host ">>> Parameters: $shown" -ForegroundColor DarkGray
}
Write-Host ("-" * 70) -ForegroundColor DarkGray

$global:LASTEXITCODE = 0
try {
    & $ScriptPath @splat
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ScriptStackTrace) { Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray }
    Complete-Run 1
}

$code = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
Write-Host ("-" * 70) -ForegroundColor DarkGray
if ($code -eq 0) {
    Write-Host ">>> Completed successfully." -ForegroundColor Green
}
else {
    Write-Host ">>> Exit code: $code" -ForegroundColor Red
}
Complete-Run $code
