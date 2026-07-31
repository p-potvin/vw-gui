#!/usr/bin/env pwsh
# vw-gui :: parameter introspector
#
# Parses a .ps1 with the PowerShell AST and emits its param() block as JSON in
# the shape vw-commands.ps1 expects. Parsing (not executing) means an uploaded
# script is never run just to learn its signature.
#
# Also lifts .SYNOPSIS from comment-based help as a Description seed.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not (Test-Path -LiteralPath $Path)) {
    throw "Script not found: $Path"
}

$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path -LiteralPath $Path).Path, [ref]$tokens, [ref]$errors)

$parseErrors = @()
if ($errors) {
    foreach ($e in $errors) {
        $parseErrors += "Line $($e.Extent.StartLineNumber): $($e.Message)"
    }
}

# Map .NET types onto the registry's vocabulary.
function Resolve-VwType {
    param($TypeConstraint)
    if (-not $TypeConstraint) { return "string" }
    $name = $TypeConstraint.TypeName.FullName
    switch -Regex ($name) {
        '^(System\.Management\.Automation\.)?SwitchParameter$|^switch$' { return "switch" }
        '^(System\.)?String\[\]$'                                      { return "string[]" }
        '^(System\.)?String$'                                          { return "string" }
        '^(System\.)?Int(32|64)$|^int$|^long$'                         { return "int" }
        '^(System\.)?(Double|Single|Decimal)$|^double$|^float$'        { return "double" }
        '^(System\.)?Boolean$|^bool$'                                  { return "bool" }
        '\[\]$'                                                        { return "string[]" }
        default                                                        { return "string" }
    }
}

$result = [System.Collections.Generic.List[object]]::new()

$paramBlock = $ast.ParamBlock
if (-not $paramBlock -and $ast.EndBlock) {
    # Fall back to a param() sitting inside the end block.
    $paramBlock = $ast.EndBlock.Statements |
        Where-Object { $_ -is [System.Management.Automation.Language.ParamBlockAst] } |
        Select-Object -First 1
}

if ($paramBlock) {
    foreach ($p in $paramBlock.Parameters) {
        $name = $p.Name.VariablePath.UserPath

        $type = Resolve-VwType $p.StaticType
        # StaticType is unreliable for switches declared via attribute order;
        # prefer the explicit type constraint attribute when present.
        $constraint = $p.Attributes |
            Where-Object { $_ -is [System.Management.Automation.Language.TypeConstraintAst] } |
            Select-Object -First 1
        if ($constraint) { $type = Resolve-VwType $constraint }

        $mandatory = $false
        $validSet = @()
        $aliases = @()

        foreach ($attr in $p.Attributes) {
            if ($attr -isnot [System.Management.Automation.Language.AttributeAst]) { continue }
            $attrName = $attr.TypeName.GetReflectionAttributeType()
            $attrShort = $attr.TypeName.Name

            if ($attrShort -match '^Parameter$') {
                foreach ($na in $attr.NamedArguments) {
                    if ($na.ArgumentName -eq "Mandatory") {
                        # Bare "Mandatory" means $true; otherwise read the literal.
                        if ($na.ExpressionOmitted) { $mandatory = $true }
                        else { $mandatory = ($na.Argument.Extent.Text -match '\$true') }
                    }
                }
            }
            elseif ($attrShort -match '^ValidateSet$') {
                foreach ($pa in $attr.PositionalArguments) {
                    $validSet += ($pa.Extent.Text -replace "^['`"]|['`"]$", "")
                }
            }
            elseif ($attrShort -match '^Alias$') {
                foreach ($pa in $attr.PositionalArguments) {
                    $aliases += ($pa.Extent.Text -replace "^['`"]|['`"]$", "")
                }
            }
        }

        $default = $null
        if ($p.DefaultValue) {
            $default = $p.DefaultValue.Extent.Text
            # A switch defaulting to $false is just the absence of the switch.
            if ($type -eq "switch" -and $default -match '^\$false$') { $default = $null }
        }

        $result.Add([ordered]@{
            Name        = $name
            Type        = $type
            Mandatory   = $mandatory
            Default     = $default
            ValidSet    = @($validSet)
            Aliases     = @($aliases)
            Description = ""
        })
    }
}

# Comment-based help synopsis, if the author wrote one.
$synopsis = ""
try {
    $help = Get-Help -Name (Resolve-Path -LiteralPath $Path).Path -ErrorAction SilentlyContinue
    if ($help -and $help.Synopsis) {
        $s = "$($help.Synopsis)".Trim()
        # Get-Help echoes the syntax line when there is no real synopsis.
        if ($s -and $s -notmatch '^[A-Za-z]:\\' -and $s -notmatch '\.ps1') { $synopsis = $s }
    }
}
catch { }

$payload = [ordered]@{
    Parameters  = $result.ToArray()
    Synopsis    = $synopsis
    ParseErrors = $parseErrors
}

ConvertTo-Json -InputObject $payload -Depth 8 -Compress
