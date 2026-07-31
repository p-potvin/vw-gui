# Roadmap

Last refreshed: Fri, 31 Jul 2026 08:05

## v1.0.0 — shipped

The command runner, end to end.

- Filterable category tree over the full registry (71 commands, 12 categories)
- Dynamic parameter forms from registry metadata, with path pickers
- Working directory picker driving the spawn `cwd`
- Serial foreground execution with live ANSI-preserved streaming and stop
- Opt-in async background queue in the rail
- Destructive-command gate (agent refusal, admin check, type-to-confirm)
- Command CRUD writing back into `vw-commands.ps1`, with AST parameter detection
- Context menu: open in editor, show in Explorer, copy as path, edit, delete
- Run history persisted to disk and replayable
- vaultwares² palette

## v1.1 — reconciliation

Make the GUI the thing that keeps the registry honest.

- Re-scan all 71 scripts and diff their real `param()` blocks against the
  registry; offer one-click fixes for missing aliases, params and `ValidateSet`
  entries (see TODO.md for the three already found)
- Surface commands whose `ScriptPath` no longer resolves
- Resolve the stale `Desktop\pwsh\VaultWares CLI\` install, one way or the other

## v1.2 — ergonomics

- QC translations and a language toggle
- Arrow-key navigation through the rail
- Favourites / recently-used pinning above the category tree
- Optional command-line preview strip

## Later

- Chain commands into a saved sequence with a shared working directory
- Watch a folder and trigger a command on change
- Export a run (command, params, cwd, output, exit code) as a shareable record
