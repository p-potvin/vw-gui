# vw-gui

Desktop front-end for the `vw` PowerShell CLI. Browse the command registry, fill
parameters from real metadata, pick the folder to run in, and watch output stream
with the colour the CLI intended.

Last refreshed: Fri, 31 Jul 2026 08:05

## What it does

- **Browse** all 71 commands across 12 categories in a filterable tree.
- **Fill parameters** with widgets derived from the registry: switches become
  toggles, `ValidateSet` becomes a select, `string[]` becomes tag chips, and
  path-ish names get a browse button.
- **Pick a working directory.** PowerShell spawns with `cwd` set to it — exactly
  as if you had opened a shell in that folder.
- **Run**, serially, with live streamed output. Long jobs can be sent to an
  async side queue so they do not block the next quick command.
- **Add, edit and delete commands.** Uploading a `.ps1` parses its `param()`
  block via the PowerShell AST and writes an entry into `vw-commands.ps1`, which
  registers it with the CLI itself — not just with this GUI.

## Requirements

- Windows, PowerShell 7 (`pwsh`) on `PATH`
- Node 18+ and the `vw` CLI source at `%USERPROFILE%\Desktop\vw-cli`

## Run it

```bash
npm install && npm start
```

If Electron's binary is missing after install, approve its postinstall:

```bash
npm install-scripts approve electron
```

## Which CLI it drives

`vw-gui` reads, writes and executes **`%USERPROFILE%\Desktop\vw-cli`** only —
the live source. It is set in `main.js` as `VW_ROOT`.

The `vw.bat` shim on `PATH` resolves to the same place, so the GUI and the
terminal drive one registry. (Until 31 Jul 2026 the shim pointed at a stale copy
under `Desktop\pwsh\VaultWares CLI\`; that has been repointed.)

## Design

Styled in **vaultwares² (vaultwares-square)** — a sibling palette to
vaultwares-revisited, created so internal tooling does not oversaturate the
aubergine + gold brand surface. It keeps the Redesign's warm/console duality but
treats the two as *simultaneous regions* rather than day/night modes:

| Region | Role | Share |
|---|---|---|
| console (obsidian) | operational main surface — where commands run | ~85% |
| warm (bone) | rail, nav, railings — where you choose | ~15% |

Tokens live in [`css/vaultwares-square.css`](css/vaultwares-square.css). No raw
hex outside that file.

## Architecture

```
main.js                      Electron main — spawning, registry IO, dialogs
preload.js                   contextBridge; renderer never sees fs/child_process
js/                          renderer modules (vanilla, no framework)
  app.js                     orchestration, run flow, destructive gate
  rail.js  form.js  jobs.js  tree, dynamic form, job queue + console
  editor.js  history.js      command CRUD, persisted run history
  ansi.js  modal.js  ...     ANSI renderer, dialogs, helpers
scripts/                     PowerShell backend
  vwg-read-registry.ps1      executes vw-commands.ps1 -> JSON
  vwg-write-registry.ps1     surgical insert/update/delete + backup + rollback
  vwg-parse-params.ps1       AST introspection of an uploaded .ps1
  vwg-run.ps1                argument splatting + ANSI preservation
```

### Three things worth knowing

1. **Arguments are splatted as a hashtable, not an array.** Array splatting
   binds positionally in PowerShell, so `@('-Count','4')` passes `-Count` as a
   value. Parameters travel base64-encoded to sidestep shell quoting.

2. **`Write-Host` colour is re-emitted by a proxy.** PowerShell strips ANSI when
   stdout is redirected, which it always is under Electron. `vwg-run.ps1`
   overrides `Write-Host` so the console shows what a terminal would.

3. **The destructive gate is re-implemented, not reused.** `vw.ps1`'s gate calls
   `Read-Host` and refuses outright when `[Console]::IsInputRedirected` is true —
   always the case with piped stdio. The GUI enforces the same three checks
   (AI-environment refusal, Administrator requirement, explicit confirmation)
   and then invokes the target script directly.

## QA flags

```bash
electron . --vwg-debug                      # forward renderer console
electron . --vwg-shot out.png               # capture the window, then quit
electron . --remote-debugging-port=9223     # drive over CDP
```
