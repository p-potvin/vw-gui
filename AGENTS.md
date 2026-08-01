# vw-gui — agent instructions

Start at the company router: `vaultwares-docs/instructions/ROUTER.md`.
This file only covers what is specific to this repo.

Last refreshed: Fri, 31 Jul 2026 08:05

## What this repo is

An Electron desktop front-end for the `vw` PowerShell CLI. It is **internal
tooling**, not a shipped product surface.

> **Do not confuse `vw` with `vaultwares-cli`.** The `vw` CLI is the PowerShell
> command router at `Desktop\vw-cli` (`vw.ps1` + `vw-commands.ps1`) that this GUI
> drives. `Github Repos\vaultwares-cli` is a separate, older Rust project and has
> nothing to do with this repo.

## Hard rules

1. **It drives `Desktop\vw-cli` and nothing else.** `VW_ROOT` in `main.js` is
   the single source. Do not repoint it at `Desktop\pwsh\VaultWares CLI\` — that
   copy is stale by design of the current (broken) rebuild flow.

2. **Never regenerate `vw-commands.ps1`.** It is hand-maintained: ordered
   hashtable, category comment headers, aligned `=`, a regex hint in the header,
   mixed tab and space indentation. `vwg-write-registry.ps1` inserts, updates and
   deletes single blocks surgically and leaves the rest byte-identical. A
   round-trip of insert → update → delete must produce zero diff; there is a
   manual check for this in the commit history of that script.

3. **The registry writer backs up and rolls back.** Every write copies to
   `vw-cli/.vwg-backups/` first, then re-executes the registry to prove it still
   parses. If validation fails the backup is restored and the write throws. Keep
   that invariant.

4. **Do not weaken the destructive gate.** The global gating policy stands: AI
   assistants must not execute destructive `vw` commands. The GUI preserves the
   environment-variable refusal (`ANTIGRAVITY_AGENT`, `AGENT_NAME`, `DEVIN`)
   alongside the Administrator check and human confirmation. If you are an agent
   working in this repo, you cannot run those commands here either.

5. **Never let the exit sentinel reach the terminal.** `vwg-run.ps1` prints
   `<<VWG:EXIT:<job>:<code>>>` as its last line and `main.js` strips it from the
   stream. It must stay emitted by the runner, never appended to the typed
   command line — the shell echoes what is typed, and an echoed sentinel would
   register as a completed run before the command had even started.

6. **Do not call `term.kill()` from node-pty.** On Windows it loads
   `conpty_console_list_agent`, which throws `AttachConsole failed` and takes
   the process down. Use `killTree` / `killChildrenOf` in `main.js`, which shell
   out to `taskkill`.

## Styling

This repo uses **vaultwares² (vaultwares-square)**, defined locally in
`css/vaultwares-square.css` — not the `vaultwares-themes` submodule.

**Documented reason for the deviation** (per PROJECT_CREATION): the palette was
commissioned specifically so internal tooling stops oversaturating the
vaultwares-revisited aubergine + gold brand surface. It deliberately keeps the
Redesign's structural warm/console duality — console is the operational main
area, warm is the rail — and only the hues differ. Adding `vaultwares-themes` as
a submodule here would reintroduce the tokens the palette exists to avoid.

Rules that still apply:
- Never use a raw hex outside `css/vaultwares-square.css`.
- Console and warm are **simultaneous regions**, not modes. Do not add a
  day/night toggle.
- Geometry follows the Redesign: cards 28px, panels 16px, pills 20px,
  buttons/inputs 4px, 8px spacing grid.

## Copy

English only, but every string lives in `js/translations.en.js` behind `i18n.t()`.
Adding QC means adding `translations.qc.js` with the same keys — do not inline
user-facing strings into markup or JS.

## Verifying a change

There is no test runner. Verify like this:

```bash
node --check main.js preload.js js/*.js
electron . --vwg-shot shot.png              # renders the window itself
electron . --remote-debugging-port=9223     # then drive it over CDP
```

Do **not** verify by screenshotting the desktop — it captures whatever the user
has open. `--vwg-shot` uses `webContents.capturePage()`, which renders only this
app's window.

When touching the registry writer, always test against a **copy** of
`vw-commands.ps1`, never the real one.
