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
main.js                      Electron main — PTY sessions, registry IO, dialogs
preload.js                   contextBridge; renderer never sees fs/child_process
js/                          renderer modules (vanilla, no framework)
  app.js                     orchestration, run flow, destructive gate
  terminal.js                xterm instances, one per PTY session
  rail.js  form.js  jobs.js  tree, dynamic form, job queue
  drawers.js  settings.js    rail drawers, preferences
  editor.js  history.js      command CRUD, persisted run history
  validate.js                format inference and field validation
  extensions.js              file-type hints for pickers + soft validation
  modal.js  toast.js  util.js  dialogs, notifications, helpers
scripts/                     PowerShell backend
  vwg-read-registry.ps1      executes vw-commands.ps1 -> JSON
  vwg-write-registry.ps1     surgical insert/update/delete + backup + rollback
  vwg-parse-params.ps1       AST introspection of an uploaded .ps1
  vwg-run.ps1                argument splatting + exit sentinel
```

### Four things worth knowing

1. **Everything runs in a real PowerShell.** The output pane is an xterm bound
   to a persistent `pwsh` PTY (node-pty + conpty). Commands are typed into that
   live shell, so anything interactive works — `Read-Host`, credential prompts,
   ffmpeg's overwrite question, Ctrl+C. You can also just type in it.

2. **Exit codes come back through a sentinel.** A terminal has no exit channel,
   so `vwg-run.ps1` prints `<<VWG:EXIT:<job>:<code>>>` as its final line. The
   main process strips that marker from the stream before it reaches the
   terminal, so it is never displayed. The sentinel is emitted by the runner
   rather than appended to the typed command line, so the shell's own echo of
   that line can never be mistaken for completion.

3. **Arguments are splatted as a hashtable, not an array.** Array splatting
   binds positionally in PowerShell, so `@('-Count','4')` passes `-Count` as a
   value. Parameters travel base64-encoded to sidestep shell quoting.

4. **The destructive gate is enforced by the GUI.** It applies the same three
   checks as `vw.ps1` — AI-environment refusal, Administrator requirement,
   explicit confirmation — then invokes the target script directly.

   (Historical note: this was originally *required*, because `vw.ps1`'s gate
   calls `Read-Host` and refuses when `[Console]::IsInputRedirected` is true,
   which it always was under piped stdio. Inside a PTY that is no longer true,
   so the CLI's own gate would now function. The GUI keeps its own gate anyway,
   so the confirmation is a real dialog rather than a typed line.)

### Settings

Preferences live in `prefs.json` beside the run history, under the app's
userData directory. Every control writes immediately — there is no Save button.

- **System tray** — optional icon showing the running job count. With
  *Minimise to tray* on, closing and minimising hide the window instead of
  quitting, so background jobs survive. Quit from the tray menu. The nested
  setting is disabled unless the tray itself is on, since minimising to a tray
  that does not exist would strand the window.
- **Default values** — `None` (fields start empty), `Remember last directory`
  (working directory only, per command), or `Remember all` (every parameter,
  per command). Values are remembered when a command runs.
- **Reorder categories** — puts the rail into a drag state with grips; the
  order persists to `prefs.categoryOrder`. New categories appear alphabetically
  after the ones you have ordered.

The placeholder tray and app icons are generated by `node scripts/make-icon.js`
— an obsidian field with a bone rail and the coral seam. Replace `build/*.png`
with the real logo and delete that script.

### Sessions

| Session | Lifetime | Used by |
|---|---|---|
| `session-main` | persistent, created at boot | every foreground run; free typing |
| `session-bg-N` | per job, retired ~45s after it ends | one background job each |

Killing a run sends Ctrl+C first and only escalates to killing the child process
tree if the job is still active a moment later — a PowerShell script often
cleans up on cancellation, and killing the shell outright would destroy the
session along with it.

## QA flags

```bash
electron . --vwg-debug                      # forward renderer console
electron . --vwg-shot out.png               # capture the window, then quit
electron . --remote-debugging-port=9223     # drive over CDP
```
