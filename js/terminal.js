/* ==========================================================================
   vw-gui :: terminal sessions
   --------------------------------------------------------------------------
   One xterm instance per PTY session. The foreground session is persistent and
   serial; each background job gets its own. Switching which session is
   "watched" swaps the visible terminal — buffers are never replayed, so
   scrollback survives.

   Because commands run in a real pwsh, anything interactive works: Read-Host,
   ffmpeg's overwrite prompt, credential requests, Ctrl+C.
   ========================================================================== */

(function () {
  const host = document.getElementById("terminal-host");

  const FOREGROUND = "session-main";

  /** sessionId -> { term, fit, el, ready } */
  const terminals = new Map();
  let visibleId = null;

  /* ---- Theme ----------------------------------------------------------- */

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function buildTheme() {
    return {
      background: cssVar("--vwsq-console-sunken") || "#070810",
      foreground: cssVar("--vwsq-console-text") || "#BAC2D2",
      cursor: cssVar("--vwsq-iris-400") || "#8189F5",
      cursorAccent: cssVar("--vwsq-console-sunken") || "#070810",
      selectionBackground: "rgba(110, 123, 242, 0.30)",

      black: "#11141B",
      red: cssVar("--vwsq-coral-700") || "#C4573A",
      green: "#3FAE74",
      yellow: cssVar("--vwsq-signal-warning") || "#E9B054",
      blue: cssVar("--vwsq-iris-700") || "#4551B8",
      magenta: "#8F6FD6",
      cyan: "#4A97C4",
      white: cssVar("--vwsq-console-text-secondary") || "#BAC2D2",

      brightBlack: cssVar("--vwsq-console-text-dim") || "#6B7385",
      brightRed: cssVar("--vwsq-signal-alert") || "#F45D6B",
      brightGreen: cssVar("--vwsq-signal-online") || "#56D98D",
      brightYellow: cssVar("--vwsq-signal-warning") || "#E9B054",
      brightBlue: cssVar("--vwsq-iris-300") || "#98A1F7",
      brightMagenta: cssVar("--vwsq-signal-sync") || "#A585F5",
      brightCyan: cssVar("--vwsq-signal-relay") || "#5AB8F0",
      brightWhite: cssVar("--vwsq-console-text-bright") || "#E6EAF2",
    };
  }

  /* ---- Lifecycle -------------------------------------------------------- */

  async function ensure(sessionId, { cwd, background } = {}) {
    if (terminals.has(sessionId)) return terminals.get(sessionId);

    const el = U.el("div", { class: "term", "data-session": sessionId });
    el.hidden = true;
    host.appendChild(el);

    const term = new window.Terminal({
      fontFamily: cssVar("--vwsq-font-mono") || "monospace",
      fontSize: 12.5,
      lineHeight: 1.35,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 8000,
      allowProposedApi: true,
      theme: buildTheme(),
    });

    const fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(el);

    // Keystrokes go straight to the shell.
    term.onData((data) => {
      window.vwg.ptyInput({ id: sessionId, data });
    });

    const record = { term, fit, el, sessionId };
    terminals.set(sessionId, record);

    // The element must be visible before fit() can measure it.
    const wasHidden = el.hidden;
    el.hidden = false;
    try {
      fit.fit();
    } catch { /* zero-size host during boot */ }
    el.hidden = wasHidden;

    await window.vwg.ptyCreate({
      id: sessionId,
      cwd,
      background: !!background,
      cols: term.cols,
      rows: term.rows,
    });

    return record;
  }

  function show(sessionId) {
    visibleId = sessionId;
    for (const [id, rec] of terminals) {
      const on = id === sessionId;
      rec.el.hidden = !on;
      if (on) {
        refit(id);
        rec.term.focus();
      }
    }
  }

  function refit(sessionId) {
    const rec = terminals.get(sessionId || visibleId);
    if (!rec || rec.el.hidden) return;
    try {
      rec.fit.fit();
      window.vwg.ptyResize({ id: rec.sessionId, cols: rec.term.cols, rows: rec.term.rows });
    } catch { /* not laid out yet */ }
  }

  async function dispose(sessionId) {
    const rec = terminals.get(sessionId);
    if (!rec) return;
    await window.vwg.ptyDispose({ id: sessionId });
    rec.term.dispose();
    rec.el.remove();
    terminals.delete(sessionId);
    if (visibleId === sessionId) show(FOREGROUND);
  }

  function clear(sessionId) {
    const rec = terminals.get(sessionId || visibleId);
    if (rec) rec.term.clear();
  }

  function selectionOrAll(sessionId) {
    const rec = terminals.get(sessionId || visibleId);
    if (!rec) return "";
    const sel = rec.term.getSelection();
    if (sel) return sel;

    const buf = rec.term.buffer.active;
    const lines = [];
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join("\n").replace(/\n+$/, "");
  }

  function scrollToBottom(sessionId) {
    const rec = terminals.get(sessionId || visibleId);
    if (rec) rec.term.scrollToBottom();
  }

  /* ---- Wiring ----------------------------------------------------------- */

  window.vwg.onPtyData(({ id, data }) => {
    const rec = terminals.get(id);
    if (rec) rec.term.write(data);
  });

  window.vwg.onPtyClosed(({ id }) => {
    const rec = terminals.get(id);
    if (rec) {
      rec.term.write("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
    }
  });

  window.addEventListener("resize", U.debounce(() => refit(), 120));

  window.term = {
    FOREGROUND,
    ensure,
    show,
    refit,
    dispose,
    clear,
    selectionOrAll,
    scrollToBottom,
    get visibleId() { return visibleId; },
  };
})();
