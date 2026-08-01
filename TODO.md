# TODO

Last refreshed: Fri, 31 Jul 2026 08:05

## Known issues found while building

- [x] **The PATH `vw` was stale.** `vw.bat` pointed at
      `Desktop\pwsh\VaultWares CLI\vw.ps1`, whose registry was 16 KB from 24 Jun
      against a 47 KB live source. Resolved by the owner on 31 Jul 2026:
      `vw.bat`, the other files referencing `Desktop\pwsh`, and the related env
      vars were all repointed at `Desktop\vw-cli`. `VW_ROOT` in `main.js` was
      already correct and needs no change.

- [ ] **`Start-TorboxWebdav` points at a missing script.** It is the only
      registry entry whose `ScriptPath` does not exist on disk. The GUI flags it
      with an amber dot and a "script missing" chip rather than hiding it.

- [ ] **Registry drift from actual scripts.** The AST parser found parameters the
      registry does not list — e.g. `Extract-Video.ps1` has a `-t` alias for
      `TargetDir`, `record-agent-change.ps1` has `Location` and `_Overflow`, and
      `Convert-Video.ps1` has a 16th preset (`vsr-denoise`) the registry's
      `ValidSet` is missing. A "re-scan and reconcile" action could surface these
      across all 71 commands.

## Validation decisions (confirmed 31 Jul 2026)

- `record-change -Metrics` and `-Flags` are **unused fields**. Basic
  `key:value` shape checking is sufficient — do not build a JSON schema.
- File-extension hints are **images and videos mostly**, kept in
  `js/extensions.js`. `.ts` is deliberately excluded from the video list
  despite being a valid transport-stream extension, because it collides with
  TypeScript in this workspace.
- All extension checking is **soft**: warn, never block. The `vw` CLI does the
  real validation. The GUI only catches inattention and reminds about formats.

## Next

- [ ] QC translations (`js/translations.qc.js`) + a language toggle.
- [ ] Command-line preview strip showing the `vw <cmd> -Param value` being built.
      Cut from v1 deliberately; revisit if the GUI should teach the CLI.
- [ ] Keyboard navigation through the rail tree (arrow keys), not just Ctrl+K.
- [ ] Desktop shortcut + icon; wire into `create-shortcuts.ps1`.

## Won't do

- Day/night theme toggle. Console and warm are simultaneous regions here.
- Mobile/touch/RTL/print layouts. Desktop Electron only, 1024px floor.
- Unlimited parallel jobs. Serial foreground + opt-in async queue is the model.
