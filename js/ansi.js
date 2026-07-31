/* ==========================================================================
   vw-gui :: ANSI renderer
   --------------------------------------------------------------------------
   vwg-run.ps1 proxies Write-Host so the colour the CLI intends survives the
   pipe. This turns those SGR sequences into spans, and drops the cursor and
   erase sequences that make no sense in a scrollback pane.
   ========================================================================== */

(function () {
  // SGR: ESC [ ... m   — the only sequence we render.
  const SGR = /\x1b\[([0-9;]*)m/g;
  // Everything else CSI-ish gets stripped rather than printed as garbage.
  const OTHER_CSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
  const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

  const COLOR_CLASSES = new Set([30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97]);

  /**
   * Convert a chunk of ANSI text into DocumentFragment nodes.
   * State is carried by the caller so colour can span chunk boundaries.
   */
  function render(text, state) {
    const frag = document.createDocumentFragment();
    const clean = String(text).replace(OSC, "").replace(OTHER_CSI, (m) =>
      // Keep SGR (ends in 'm'); discard cursor moves, erases, etc.
      m.endsWith("m") ? m : ""
    );

    let lastIndex = 0;
    SGR.lastIndex = 0;
    let match;

    const emit = (chunk) => {
      if (!chunk) return;
      const classes = [];
      if (state.color && COLOR_CLASSES.has(state.color)) classes.push("a-" + state.color);
      if (state.bold) classes.push("a-b");
      if (state.stderr) classes.push("a-stderr");

      if (classes.length) {
        const span = document.createElement("span");
        span.className = classes.join(" ");
        span.textContent = chunk;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(chunk));
      }
    };

    while ((match = SGR.exec(clean)) !== null) {
      emit(clean.slice(lastIndex, match.index));
      lastIndex = SGR.lastIndex;

      const codes = match[1].split(";").filter((c) => c !== "").map(Number);
      if (codes.length === 0) codes.push(0);

      for (const code of codes) {
        if (code === 0) {
          state.color = null;
          state.bold = false;
        } else if (code === 1) {
          state.bold = true;
        } else if (code === 22) {
          state.bold = false;
        } else if (code === 39) {
          state.color = null;
        } else if (COLOR_CLASSES.has(code)) {
          state.color = code;
        }
        // Background codes (40-47/100-107) are intentionally ignored: the
        // console pane owns its background.
      }
    }

    emit(clean.slice(lastIndex));
    return frag;
  }

  function newState(opts) {
    return { color: null, bold: false, stderr: !!(opts && opts.stderr) };
  }

  /** Strip every escape sequence — used for the clipboard copy. */
  function strip(text) {
    return String(text)
      .replace(OSC, "")
      .replace(SGR, "")
      .replace(OTHER_CSI, "");
  }

  window.ANSI = { render, newState, strip };
})();
